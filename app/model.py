from app.backends import chat, chat_stream, chat_stream_with_reasoning, get_backend


def get_llama():
    return get_backend()


def llama_chat(messages):
    return chat(messages)


def llama_chat_stream(messages):
    yield from chat_stream(messages)


def llama_chat_stream_with_reasoning(messages):
    yield from chat_stream_with_reasoning(messages)
