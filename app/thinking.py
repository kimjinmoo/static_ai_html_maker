import threading


_think_filter_local = threading.local()


def _get_think_state():
    if not hasattr(_think_filter_local, "state"):
        _think_filter_local.state = {"buffer": "", "inside": False, "close_tag": None}
    return _think_filter_local.state


def filter_thinking_stream(text):
    state = _get_think_state()
    state["buffer"] += text

    buf = state["buffer"]
    state["buffer"] = ""

    if state["inside"]:
        close_tag = state["close_tag"]
        close_idx = buf.find(close_tag)
        if close_idx != -1:
            state["inside"] = False
            state["close_tag"] = None
            return buf[close_idx + len(close_tag):]
        return ""

    pairs = [
        ("<thinking>", "</thinking>"),
        ("<reasoning>", "</reasoning>"),
        ("<think>", "</think>"),
    ]
    for open_t, close_t in pairs:
        open_idx = buf.find(open_t)
        if open_idx != -1:
            close_idx = buf.find(close_t, open_idx + len(open_t))
            if close_idx != -1:
                new_buf = buf[:open_idx] + buf[close_idx + len(close_t):]
                return filter_thinking_stream(new_buf)
            else:
                state["inside"] = True
                state["close_tag"] = close_t
                return buf[:open_idx]

    return buf
