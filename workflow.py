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
            try:
                context = await self.extract_agent.process(context)
                logger.info("Data extraction completed successfully")
            except Exception as e:
                logger.error(f"Extraction failed: {str(e)}", exc_info=True)
                return {
                    "status": "error",
                    "invoice_path": invoice_path,
                    "error": f"Failed to extract data: {str(e)}",
                    "details": {"extraction_error": True}
                }
            
            # 2. Validate the extracted data
            logger.info("Validating extracted data...")
            try:
                is_valid, context = await self.validation_agent.process(context)
                logger.info(f"Validation {'succeeded' if is_valid else 'failed'}")
                
                result = {
                    "status": "success" if is_valid else "warning",
                    "message": "Validation passed" if is_valid else "Validation failed",
                    "invoice_path": invoice_path,
                    "extracted_data": context.structured_data or {},
                    "validation_feedback": getattr(context, 'validation_feedback', [])
                }
                
                if not is_valid and hasattr(context, 'validation_feedback'):
                    logger.warning(f"Validation issues: {context.validation_feedback}")
                
                return result
                
            except Exception as e:
                logger.error(f"Validation failed: {str(e)}", exc_info=True)
                return {
                    "status": "error",
                    "invoice_path": invoice_path,
                    "error": f"Validation error: {str(e)}",
                    "details": {"validation_error": True},
                    "extracted_data": getattr(context, 'structured_data', {})
                }
            
        except Exception as e:
            error_msg = f"Unexpected error processing invoice: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return {
                "status": "error",
                "invoice_path": invoice_path,
                "error": error_msg,
                "details": {"unexpected_error": True}
            }
