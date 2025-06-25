import logging
import os
from typing import Dict, Any, Optional
from pathlib import Path
from agents import LlamaParseAgent, DataValidationAgent, Context

# Set up logger
logger = logging.getLogger(__name__)

class InvoiceProcessingWorkflow:
    """Orchestrates the invoice processing workflow using LlamaParse"""
    
    def __init__(self):
        # Load environment variables
        # Initialize agents
        self.extract_agent = LlamaParseAgent()
        self.validation_agent = DataValidationAgent()

    async def process_invoice(self, invoice_path: str) -> Dict[str, Any]:
        """Process a single invoice through the workflow"""
        logger.info(f"Starting invoice processing for: {invoice_path}")
        
        if not os.path.exists(invoice_path):
            error_msg = f"File not found: {invoice_path}"
            logger.error(error_msg)
            return {
                "status": "error",
                "invoice_path": invoice_path,
                "error": error_msg,
                "details": {"file_exists": False}
            }
        
        # Initialize context
        context = Context(invoice_path=invoice_path)
        
        try:
            # 1. Extract data using LlamaParse
            logger.info("Starting data extraction...")
            context = await self.extract_agent.process(context)
            logger.info("Data extraction completed successfully")
            
            # 2. Validate the extracted data
            logger.info("Validating extracted data...")
            is_valid, context = await self.validation_agent.process(context)
            logger.info(f"Validation {'succeeded' if is_valid else 'failed'}")
            
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
