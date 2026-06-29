import os

from app.backends.base import ModelBackend
from app.config import GEMINI_API_KEY, GEMINI_MODEL, CHAT_SAMPLING


class GeminiBackend(ModelBackend):
    def __init__(self, api_key=None, model=None):
        self._api_key = api_key or GEMINI_API_KEY
        self._model_name = model or GEMINI_MODEL
        self._client = None

    def _get_client(self):
        if self._client is None:
            from google import genai
            self._client = genai.Client(api_key=self._api_key)
        return self._client

    def _build_contents(self, messages):
        system_instruction = ""
        contents = []
        for msg in messages:
            role = msg["role"]
            content = msg.get("content", "")
            if role == "system":
                system_instruction = content
            else:
                g_role = "user" if role == "user" else "model"
                contents.append({
                    "role": g_role,
                    "parts": [{"text": content}]
                })
        return system_instruction, contents

    def chat(self, messages):
        import google.genai as genai
        client = self._get_client()
        system_instruction, contents = self._build_contents(messages)

        response = client.models.generate_content(
            model=self._model_name,
            contents=contents,
            config={
                "system_instruction": system_instruction,
                "temperature": CHAT_SAMPLING.get("temperature", 0.6),
                "top_p": CHAT_SAMPLING.get("top_p", 0.95),
                "top_k": CHAT_SAMPLING.get("top_k", 20),
                "max_output_tokens": CHAT_SAMPLING.get("max_tokens", 8192),
            },
        )
        return response.text

    def chat_stream(self, messages):
        import google.genai as genai
        client = self._get_client()
        system_instruction, contents = self._build_contents(messages)

        for chunk in client.models.generate_content_stream(
            model=self._model_name,
            contents=contents,
            config={
                "system_instruction": system_instruction,
                "temperature": CHAT_SAMPLING.get("temperature", 0.6),
                "top_p": CHAT_SAMPLING.get("top_p", 0.95),
                "top_k": CHAT_SAMPLING.get("top_k", 20),
                "max_output_tokens": CHAT_SAMPLING.get("max_tokens", 8192),
            },
        ):
            if chunk.text:
                yield chunk.text

    def chat_stream_with_reasoning(self, messages):
        from google import genai
        from google.genai import types
        client = self._get_client()
        system_instruction, contents = self._build_contents(messages)

        for chunk in client.models.generate_content_stream(
            model=self._model_name,
            contents=contents,
            config={
                "system_instruction": system_instruction,
                "temperature": CHAT_SAMPLING.get("temperature", 0.6),
                "top_p": CHAT_SAMPLING.get("top_p", 0.95),
                "top_k": CHAT_SAMPLING.get("top_k", 20),
                "max_output_tokens": CHAT_SAMPLING.get("max_tokens", 8192),
                "thinking_config": {"include_thoughts": True},
            },
        ):
            if not chunk.candidates:
                continue
            for part in chunk.candidates[0].content.parts:
                text = getattr(part, "text", None) or ""
                if not text:
                    continue
                is_thought = getattr(part, "thought", False)
                if is_thought:
                    yield {"type": "reasoning", "text": text}
                else:
                    yield {"type": "content", "text": text}
