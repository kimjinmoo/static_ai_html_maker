from abc import ABC, abstractmethod
from typing import Iterator


class ModelBackend(ABC):
    @abstractmethod
    def chat(self, messages: list) -> str:
        ...

    @abstractmethod
    def chat_stream(self, messages: list) -> Iterator[str]:
        ...

    @abstractmethod
    def chat_stream_with_reasoning(self, messages: list) -> Iterator[dict]:
        ...
