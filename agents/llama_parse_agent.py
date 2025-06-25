import os
import json
import asyncio
import logging
from typing import Dict, Any, Optional
from pathlib import Path
from llama_cloud_services import LlamaParse
from llama_cloud_services.errors import LlamaCloudError

from .base_agent import BaseAgent, Context

# Set up logger
logger = logging.getLogger(__name__)


class LlamaParseAgent(BaseAgent):
    """Agent that leverages LlamaCloud *Parse with LVM* mode to extract structured data from invoices."""

    def __init__(
        self,
    ) -> None:
        super().__init__("LlamaParseAgent")

        self.llama_api_key = os.getenv("LLAMA_CLOUD_API_KEY")
        if not self.llama_api_key:
            raise ValueError("LLAMA_CLOUD_API_KEY must be set in environment variables")

        # Initialize LlamaParse with premium mode and OCR
        self.parser = LlamaParse(
            api_key=self.llama_api_key,
            result_type="json",
            premium_mode=True,
            num_workers=1,
            verbose=True,
            language="en"
        )

    async def process(self, context: Context) -> Context:
        """Process invoice file using LlamaParse"""
        try:
            logger.info(f"Processing invoice: {context.invoice_path}")
            
            # Process the file
            result = await self.parser.aparse(context.invoice_path)
            
            # Get job details
            context.job_id = result.job_id
            context.status = result.status
            
            # Get all result formats
            context.structured_data = result.get_structured_data()
            context.markdown_docs = result.get_markdown_documents(split_by_page=True)
            context.text_docs = result.get_text_documents(split_by_page=False)
            
            logger.info(f"Successfully processed with job ID: {context.job_id}")
            return context
            
        except LlamaCloudError as e:
            logger.error(f"LlamaCloud error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Error processing invoice: {str(e)}", exc_info=True)
            raise

    async def _wait_for_job_completion(self, job_id: str) -> None:
        """Wait for the job to complete and get the final status"""
        try:
            async with aiohttp.ClientSession() as session:
                while True:
                    async with session.get(
                        f"{self.base_url}/parse/status/{job_id}",
                        headers=self.headers
                    ) as response:
                        if response.status != 200:
                            error_text = await response.text()
                            logger.error(f"Job status check failed: {error_text}")
                            return
                        
                        status = await response.json()
                        current_status = status.get('status')
                        logger.info(f"Job {job_id} current status: {current_status}")
                        
                        if current_status in ['completed', 'failed']:
                            return
                        
                    await asyncio.sleep(5)  # Wait 5 seconds before checking again
        except Exception as e:
            logger.error(f"Error checking job status: {str(e)}")

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
            
            logger.info(f"Successfully processed document with job ID: {context.job_id}")
            return context
            
        except Exception as e:
            logger.error(f"Failed to process document: {str(e)}", exc_info=True)
            raise LlamaParseError(f"Failed to process document: {str(e)}") from e
