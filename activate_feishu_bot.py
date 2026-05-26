import json
import lark_oapi as lark
from lark_oapi.api.im.v1 import *

# 你的应用凭证
APP_ID = "cli_aa9e5bf0fab8dbc3"
APP_SECRET = "***REDACTED***"

# 构建客户端（用于发送消息）
client = lark.Client.builder().app_id(APP_ID).app_secret(APP_SECRET).build()

def do_p2_im_message_receive_v1(data: lark.im.v1.P2ImMessageReceiveV1) -> None:
    print(f'收到消息事件，原始数据: {lark.JSON.marshal(data, indent=4)}')

    # 1. 获取发送者的 open_id
    open_id = data.event.sender.sender_id.open_id
    # 2. 获取会话类型和会话ID（群聊用 chat_id，私聊用 open_id 即可）
    chat_type = data.event.message.chat_type  # 'group' 或 'p2p'
    chat_id = data.event.message.chat_id if chat_type == 'group' else None
    
    # 3. 解析消息内容
    content_str = data.event.message.content
    try:
        content = json.loads(content_str)
        text = content.get("text", "")
    except:
        text = content_str

    print(f"用户 {open_id} 说: {text}，会话类型: {chat_type}")

    # 4. 构造回复消息（简单回复，也可根据业务逻辑定制）
    reply_text = f"收到你的消息：{text}\n客服会尽快回复你。"
    
    if chat_type == 'group':
        # 群聊中回复，需要将消息发送到群，并 @ 发送者
        # 注意：群聊中要用 chat_id 作为 receive_id，类型为 chat_id
        # 同时可在消息内容中添加 @ 人
        mention = Mention().builder().key("@all").id(open_id).name("").build()
        # 或者简单文本不含 @
        reply_body = MessageCreateReqBody.builder() \
            .receive_id(chat_id) \
            .msg_type("text") \
            .content(json.dumps({"text": reply_text})) \
            .build()
        req = MessageCreateReq.builder() \
            .receive_id_type("chat_id") \
            .req_body(reply_body) \
            .build()
    else:
        # 私聊直接回复 open_id
        reply_body = MessageCreateReqBody.builder() \
            .receive_id(open_id) \
            .msg_type("text") \
            .content(json.dumps({"text": reply_text})) \
            .build()
        req = MessageCreateReq.builder() \
            .receive_id_type("open_id") \
            .req_body(reply_body) \
            .build()

    try:
        resp = client.im.v1.message.create(req)
        if resp.code != 0:
            print(f"发送消息失败: {resp.msg}")
        else:
            print("回复成功")
    except Exception as e:
        print(f"发送消息异常: {e}")

# 构建事件处理器
event_handler = lark.EventDispatcherHandler.builder("", "") \
    .register_p2_im_message_receive_v1(do_p2_im_message_receive_v1) \
    .build()

def main():
    cli = lark.ws.Client(APP_ID, APP_SECRET,
                         event_handler=event_handler,
                         log_level=lark.LogLevel.INFO)
    cli.start()

if __name__ == "__main__":
    main()