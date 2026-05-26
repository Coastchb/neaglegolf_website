const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const axios = require("axios");

initializeApp();
const db = getFirestore();

const FEISHU_APP_ID = "cli_aa9e5bf0fab8dbc3";
const FEISHU_APP_SECRET = "***REDACTED***";
const FEISHU_RECEIVE_ID = "oc_d59bf557afa14605a161ef27827a3b38";

/**
 * 获取飞书 tenant access token
 * @return {Promise<string>}
 */
async function getFeishuToken() {
  const res = await axios.post(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET},
  );
  return res.data.tenant_access_token;
}

/**
 * 功能一：监听 Firestore 新留言 → 推送飞书卡片
 */
exports.onNewMessageCreated = onDocumentCreated(
  "artifacts/neagle_golf/messages/{messageId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const messageData = snapshot.data();
    const docId = event.params.messageId;
    const guestId = messageData.userId;
    const content = messageData.content;

    logger.log(`新留言来自 ${guestId}，docId: ${docId}`);

    let token;
    try {
      token = await getFeishuToken();
    } catch (e) {
      logger.error("获取飞书 Token 失败:", e.message);
      return;
    }

    // 飞书消息卡片配置
    // 文档：https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3TO241Nx3UjN
    const cardPayload = {
      config: {
        enable_forward: true,
        update_multi: false,
      },
      header: {
        template: "turquoise",
        title: {tag: "plain_text", content: "🔔 NEAGLE GOLF 官网有新留言"},
      },
      elements: [
        {
          tag: "div",
          fields: [
            {
              is_short: true,
              text: {tag: "lark_md", content: `**用户 ID:**\n\`${guestId}\``},
            },
            {
              is_short: true,
              text: {
                tag: "lark_md",
                content: `**时间:**\n${new Date().toLocaleString("zh-CN", {timeZone: "Asia/Shanghai"})}`,
              },
            },
          ],
        },
        {tag: "hr"},
        {tag: "div", text: {tag: "lark_md", content: `**留言内容:**\n${content}`}},
        {tag: "hr"},
        {
          tag: "div",
          text: {tag: "lark_md", content: "💡 *在下方输入回复内容并点击发送。*"},
        },
        {
          tag: "action",
          actions: [
            {
              tag: "input",
              name: "reply_input",
              placeholder: {tag: "plain_text", content: "请输入回复内容..."},
              width: "default",
            },
            {
              tag: "button",
              name: "submit_btn", // 添加name属性，飞书需要这个来关联表单
              text: {tag: "plain_text", content: "发送回复"},
              type: "submit", // submit类型会收集同一action块中的input值
              value: {
                action_type: "submit_reply",
                doc_id: docId,
                guest_id: guestId,
              },
            },
          ],
        },
      ],
    };

    try {
      await axios.post(
        "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
        {
          receive_id: FEISHU_RECEIVE_ID,
          msg_type: "interactive",
          content: JSON.stringify(cardPayload),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=utf-8",
          },
        },
      );
      logger.log(`飞书卡片发送成功，docId=${docId}`);
    } catch (err) {
      logger.error("发送飞书卡片失败:", err.message);
    }
  },
);

/**
 * 功能二：接收飞书卡片回调
 *
 * 飞书 card.action.trigger 回调数据结构：
 * {
 *   "token": "验证token",
 *   "action": {
 *     "value": { "action_type": "submit_reply", "doc_id": "xxx", "guest_id": "xxx" },
 *     "form_value": { "reply_input": "用户输入的内容" }
 *   },
 *   "context": { "open_id": "xxx", "tenant_key": "xxx" }
 * }
 *
 * 错误码 200340 通常表示：
 * 1. 用户不在群组中或已被禁用
 * 2. 回调响应格式问题
 */
exports.feishuCallback = onRequest(
  {region: "us-central1", cors: true},
  async (req, res) => {
    logger.log("=== 飞书回调开始 ===");
    logger.log("Request method:", req.method);
    logger.log("Request headers:", JSON.stringify(req.headers, null, 2));
    logger.log("Request body:", JSON.stringify(req.body, null, 2));

    // URL 验证（飞书配置回调地址时会发送）
    if (req.body.type === "url_verification") {
      logger.log("飞书回调地址验证，返回 challenge");
      return res.json({challenge: req.body.challenge});
    }

    // 处理 card.action.trigger 回调
    // 飞书 schema 2.0 格式：
    // {
    //   "schema": "2.0",
    //   "header": { "event_id": "xxx", "token": "xxx", ... },
    //   "event": { "action": { "value": {...}, "form_value": {...} }, "context": {...} }
    // }
    const body = req.body;

    logger.log("=== 飞书回调数据结构 ===");
    logger.log("- schema:", body.schema);
    logger.log("- body keys:", Object.keys(body));

    // 获取 event 对象（schema 2.0 格式）
    const event = body.event || {};

    // 获取 action 对象
    const action = event.action || body.action || {};
    const value = action.value || {};
    const formValue = action.form_value || {};

    logger.log("- event keys:", Object.keys(event));
    logger.log("- action:", JSON.stringify(action, null, 2));
    logger.log("- value:", JSON.stringify(value, null, 2));
    logger.log("- formValue:", JSON.stringify(formValue, null, 2));

    // 检查是否是 submit_reply 动作
    const actionType = value.action_type;

    if (!actionType) {
      logger.warn("回调中没有 action_type，可能不是回复操作");
      logger.log("完整 event 对象:", JSON.stringify(event, null, 2));
      return res.json({toast: {type: "info", content: "操作已收到"}});
    }

    if (actionType !== "submit_reply") {
      logger.log(`忽略非 submit_reply 动作: ${actionType}`);
      return res.json({toast: {type: "info", content: "操作已收到"}});
    }

    const docId = value.doc_id;
    const guestId = value.guest_id;

    // 获取回复内容
    let replyText = "";
    if (formValue.reply_input) {
      replyText = formValue.reply_input;
    } else if (typeof formValue === "string") {
      replyText = formValue;
    } else if (action.reply_input) {
      replyText = action.reply_input;
    }
    replyText = replyText.trim();

    logger.log(`处理回复: docId=${docId}, guestId=${guestId}, replyText=${replyText}`);

    // 验证必要字段
    if (!replyText) {
      logger.warn("回复内容为空");
      return res.json({toast: {type: "error", content: "回复内容不能为空！请在输入框填写内容后发送。"}});
    }

    if (!docId) {
      logger.error("缺少 doc_id");
      return res.json({toast: {type: "error", content: "系统错误：缺少消息ID"}});
    }

    try {
      // 写入 Firestore
      await db
        .collection("artifacts")
        .doc("neagle_golf")
        .collection("messages")
        .doc(docId)
        .set({
          reply: replyText,
          replyTime: new Date().toISOString(),
        }, {merge: true});

      logger.log("Firestore 写入成功，回复已保存");

      // 返回成功提示
      return res.json({
        toast: {type: "success", content: "✅ 回复已同步至官网！"},
      });
    } catch (error) {
      logger.error("写入 Firestore 失败:", error);
      return res.json({toast: {type: "error", content: "保存失败，请重试"}});
    }
  },
);

/**
 * 功能三：前端聊天 API 网关
 */
exports.chatApi = onRequest(
  {region: "us-central1", cors: true},
  async (req, res) => {
    const path = req.path;

    if (path === "/chatMessages") {
      const guestId = req.query.guestId;
      if (!guestId) {
        return res.status(400).json({error: "Missing guestId"});
      }
      try {
        const snapshot = await db
          .collection("artifacts")
          .doc("neagle_golf")
          .collection("messages")
          .where("userId", "==", guestId)
          .get();
        const messages = [];
        snapshot.forEach((doc) => messages.push(doc.data()));
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        return res.json({messages});
      } catch (e) {
        return res.status(500).json({error: e.message});
      }
    }

    if (path === "/chatSend") {
      const {guestId, content} = req.body;
      if (!guestId || !content) {
        return res.status(400).json({error: "Missing guestId or content"});
      }
      try {
        const docRef = await db
          .collection("artifacts")
          .doc("neagle_golf")
          .collection("messages")
          .add({
            userId: guestId,
            content,
            reply: "",
            timestamp: new Date().toISOString(),
          });
        return res.json({ok: true, id: docRef.id});
      } catch (e) {
        return res.status(500).json({error: e.message});
      }
    }

    if (path === "/profileSave") {
      const {guestId, contact} = req.body;
      if (!guestId || !contact) {
        return res.status(400).json({error: "Missing guestId or contact"});
      }
      try {
        await db
          .collection("artifacts")
          .doc("neagle_golf")
          .collection("users")
          .doc(guestId)
          .set({contact, updatedAt: new Date().toISOString()}, {merge: true});
        return res.json({ok: true});
      } catch (e) {
        return res.status(500).json({error: e.message});
      }
    }

    if (path === "/profileGet") {
      const guestId = req.query.guestId;
      if (!guestId) {
        return res.status(400).json({error: "Missing guestId"});
      }
      try {
        const docSnap = await db
          .collection("artifacts")
          .doc("neagle_golf")
          .collection("users")
          .doc(guestId)
          .get();
        return res.json(docSnap.exists ? docSnap.data() : {});
      } catch (e) {
        return res.status(500).json({error: e.message});
      }
    }

    return res.status(404).send("Not Found");
  },
);
