import logging
import os
from typing import Dict, Any, Optional
from pathlib import Path
from agents.base_agent import Context
from agents.llama_parse_agent import LlamaParseAgent
from agents.excel_writer_agent import ExcelWriterAgent

# Set up logger
logger = logging.getLogger(__name__)

class InvoiceProcessingWorkflow:
    """Workflow orchestrator for invoice processing."""

    def __init__(self):
        """Initialize the workflow with required agents."""
        self.llama_parse_agent = LlamaParseAgent()
        self.excel_writer_agent = ExcelWriterAgent()

    async def process_invoice(self, file_path: str, output_dir: Optional[str] = None):
        """Process an invoice file through the workflow."""
        logger.info(f"Starting invoice processing for: {file_path}")
        
        if not os.path.exists(file_path):
            error_msg = f"File not found: {file_path}"
            logger.error(error_msg)
            return {
                "status": "error",
                "invoice_path": file_path,
                "error": error_msg,
                "details": {"file_exists": False}
            }
        
        try:
            # Initialize context
            context = Context(invoice_path=file_path)

            # Step 1: Parse invoice using LlamaParse
            logger.info("Starting data extraction...")
            context = await self.llama_parse_agent.process(context)
            logger.info("Data extraction completed successfully")

            # Prepare result
            
            # Format the response to match frontend expectations
            result = {
                "status": "success" if is_valid else "warning",
                "message": "Validation passed" if is_valid else "Validation failed",
                "invoice_path": invoice_path,
                "job_id": context.job_id if hasattr(context, 'job_id') else None,
                "data": {
                    "json": context.structured_data or {},
                    "markdown": "# Invoice Data\n\n" + json.dumps(context.structured_data, indent=2).replace("\n", "\n\n"),
                    "text": json.dumps(context.structured_data, indent=2)
                },
                "validation_feedback": getattr(context, 'validation_feedback', [])
            }
            
            if not is_valid and hasattr(context, 'validation_feedback'):
                logger.warning(f"Validation issues: {context.validation_feedback}")
            
            return result
            
        except Exception as e:
            error_msg = f"Error processing invoice: {str(e)}"
            logger.error(error_msg, exc_info=True)
            
            # Format error response to match frontend expectations
            return {
                "status": "error",
                "invoice_path": invoice_path,
                "error": error_msg,
                "details": {"error_type": type(e).__name__},
                "job_id": getattr(context, 'job_id', None),
                "data": {
                    "json": {},
                    "markdown": "# Error\n\n" + error_msg,
                    "text": error_msg
                }
            }
