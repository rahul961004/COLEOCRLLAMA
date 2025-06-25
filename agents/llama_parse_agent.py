import os
import json
import asyncio
import logging
import base64
from typing import Dict, Any, Optional
from pathlib import Path
import aiohttp

from .base_agent import BaseAgent, Context

# Set up logger
logger = logging.getLogger(__name__)


class LlamaParseError(Exception):
    """Custom exception for LlamaParse related errors"""
    pass


class LlamaParseAgent(BaseAgent):
    """Agent that leverages LlamaCloud *Parse with LVM* mode to extract structured data from invoices."""

    def __init__(
        self,
        result_type: str = "json",
    ) -> None:
        super().__init__("LlamaParseAgent")

        self.llama_api_key = os.getenv("LLAMA_CLOUD_API_KEY")
        if not self.llama_api_key:
            raise ValueError("LLAMA_CLOUD_API_KEY must be set in environment variables")

        self.result_type = result_type
        self.base_url = "https://api.cloud.llamaindex.ai/api/parsing"
        self.headers = {
            "Authorization": f"Bearer {self.llama_api_key}",
            "Content-Type": "application/json"
        }

    async def _read_file(self, file_path: str) -> str:
        """Read file and return base64 encoded content"""
        with open(file_path, 'rb') as f:
            file_content = f.read()
        return base64.b64encode(file_content).decode('utf-8')

    async def _call_llama_parse_api(self, file_path: str, use_ocr: bool = False) -> Dict[str, Any]:
        """Call LlamaParse API with the given file and return job details"""
        try:
            # Read and encode file
            file_content = await self._read_file(file_path)
            file_name = os.path.basename(file_path)
            
            # Prepare request payload
            payload = {
                "file": file_content,
                "file_name": file_name,
                "result_type": self.result_type,
                "use_ocr": use_ocr
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/parse",
                    headers=self.headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=300)  # 5 minute timeout
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"LlamaParse API error: {response.status} - {error_text}")
                        raise LlamaParseError(f"API Error {response.status}: {error_text}")
                    
                    result = await response.json()
                    logger.info(f"LlamaParse job created: {result.get('job_id')}")
                    return result
                    
        except asyncio.TimeoutError:
            error_msg = "Request to LlamaParse API timed out"
            logger.error(error_msg)
            raise LlamaParseError(error_msg)
        except aiohttp.ClientError as e:
            logger.error(f"HTTP error calling LlamaParse API: {str(e)}")
            raise LlamaParseError(f"Failed to connect to LlamaParse API: {str(e)}")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode LlamaParse API response: {str(e)}")
            raise LlamaParseError("Invalid response from LlamaParse API")
        except Exception as e:
            logger.error(f"Unexpected error in _call_llama_parse_api: {str(e)}", exc_info=True)
            raise LlamaParseError(f"Unexpected error: {str(e)}")

    async def _process_with_parser(self, file_path: str, use_ocr: bool = False) -> Dict[str, Any]:
        """Helper method to process file with optional OCR. Returns job details."""
        try:
            logger.info(f"Processing file with {'OCR ' if use_ocr else ''}parser: {file_path}")
            
            # Call the API
            result = await self._call_llama_parse_api(file_path, use_ocr=use_ocr)
            
            if not result:
                logger.warning(f"No content returned from {'OCR ' if use_ocr else ''}parser")
                return None
                
            # Extract job details
            job_id = result.get('job_id')
            status = result.get('status')
            data = result.get('data')
            
            logger.info(f"Job {job_id} status: {status}")
            return {
                'job_id': job_id,
                'status': status,
                'data': data
            }
            
        except Exception as e:
            logger.error(f"Error in {'OCR ' if use_ocr else ''}parser: {str(e)}", exc_info=True)
            raise

    async def process(self, context: Context) -> Context:
        """Run LlamaParse on the supplied invoice file and load structured JSON."""
        if not os.path.exists(context.invoice_path):
            raise FileNotFoundError(f"Invoice file not found: {context.invoice_path}")

        try:
            # Try standard parsing first
            logger.info(f"Starting processing for: {context.invoice_path}")
            result = await self._process_with_parser(context.invoice_path, use_ocr=False)
            
            # If standard parsing fails, try with OCR
            if result is None:
                logger.info("Standard parsing failed, trying with OCR...")
                result = await self._process_with_parser(context.invoice_path, use_ocr=True)
                
                if result is None:
                    raise LlamaParseError("Failed to extract data using both standard and OCR parsers")
            
            # Store job details and results in context
            context.job_id = result.get('job_id')
            context.job_status = result.get('status')
            context.structured_data = result.get('data')
            context.extracted_text = json.dumps(result.get('data'), indent=2) if isinstance(result.get('data'), dict) else str(result.get('data'))
            
            logger.info("Successfully processed document")
            return context
            
        except Exception as e:
            logger.error(f"Failed to process document: {str(e)}", exc_info=True)
            raise LlamaParseError(f"Failed to process document: {str(e)}") from e
