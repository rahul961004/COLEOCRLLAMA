import os
import json
import asyncio
from typing import Dict, Any
from pathlib import Path

from llama_cloud_services import LlamaParse

from .base_agent import BaseAgent, Context


class LlamaParseAgent(BaseAgent):
    """Agent that leverages LlamaCloud *Parse with LVM* mode to extract structured data from invoices."""

    def __init__(
        self,

        result_type: str = "json",
    ) -> None:
        super().__init__("LlamaParseAgent")

        self.llama_api_key: str | None = os.getenv("LLAMA_CLOUD_API_KEY")
        if not self.llama_api_key:
            raise ValueError("LLAMA_CLOUD_API_KEY must be set in environment variables")

        # LlamaParse requires an LVM model API key (e.g., OpenAI key). We exclusively use
        # OPENAI_API_KEY to avoid confusion with similarly-named variables.
        # Build two parser instances running the Premium preset.
        # 1. Standard parse (fast path)
        self.parser = LlamaParse(
            api_key=self.llama_api_key,
            result_type=result_type,
            premium_mode=True,
        )
        # 2. Fallback with OCR for image-only PDFs
        self.parser_ocr = LlamaParse(
            api_key=self.llama_api_key,
            result_type=result_type,
            premium_mode=True,
            ocr=True,
        )

    async def process(self, context: Context) -> Context:
        """Run LlamaParse on the supplied invoice file and load structured JSON."""

        if not os.path.exists(context.invoice_path):
            raise FileNotFoundError(f"Invoice file not found: {context.invoice_path}")

        # Run blocking I/O in a thread so FastAPI event loop isn’t blocked.
        docs = await asyncio.to_thread(self.parser.load_data, context.invoice_path)
        # If no docs or empty payload, retry with OCR
        if not docs or not docs[0].text.strip():
            docs = await asyncio.to_thread(self.parser_ocr.load_data, context.invoice_path)
            if not docs or not docs[0].text.strip():
                raise ValueError("LlamaParse returned no data even after OCR retry")

        raw_payload: str | Dict[str, Any] = docs[0].text
        try:
            # Ensure dict
            structured: Dict[str, Any] = (
                raw_payload
                if isinstance(raw_payload, dict)
                else json.loads(raw_payload)
            )
        except json.JSONDecodeError as exc:
            raise ValueError(f"Failed to decode JSON from LlamaParse: {exc}") from exc

        context.structured_data = structured
        context.extracted_text = json.dumps(structured, indent=2)
        return context
