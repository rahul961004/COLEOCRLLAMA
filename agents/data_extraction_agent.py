from typing import Dict, Any, Optional
from llama_index.llms import OpenAI
from llama_index.llms.base import ChatMessage, MessageRole
import json
from .base_agent import BaseAgent, Context

class DataExtractionAgent(BaseAgent):
    """Agent responsible for extracting structured data from OCR text"""
    
    def __init__(self, model_name: str = "gpt-3.5-turbo"):
        super().__init__("DataExtractionAgent")
        self.llm = OpenAI(model=model_name, temperature=0.1)
    
    async def process(self, context: Context) -> Context:
        """Process the extracted text and extract structured data"""
        print(f"{self.name}: Starting data extraction...")
        
        if not context.extracted_text:
            raise ValueError("No extracted text found in context")
        
        try:
            # Extract structured data using LLM
            structured_data = await self._extract_invoice_data(context.extracted_text, context.validation_feedback)
            
            # Update context with structured data
            context.structured_data = structured_data
            context.validation_feedback = None  # Clear any previous feedback
            
            print(f"{self.name}: Successfully extracted structured data")
            return context
            
        except Exception as e:
            print(f"{self.name}: Error during data extraction: {str(e)}")
            raise
    
    async def _extract_invoice_data(self, text: str, feedback: Optional[str] = None) -> Dict[str, Any]:
        """Extract structured data from invoice text using LLM"""
        try:
            # Prepare the prompt
            system_prompt = """
            You are an expert invoice data extractor. Extract the following information from the invoice text:
            - invoice_number: The invoice number (string)
            - date: The invoice date (YYYY-MM-DD format)
            - vendor_name: The name of the vendor/company
            - total_amount: The total amount (float)
            - line_items: List of items with description, quantity, unit_price, and total_price
            
            Return the data in JSON format with the keys exactly as specified.
            If a field is not found, use null for that field.
            """
            
            user_message = f"""Extract invoice information from the following text:
            {text}
            """
            
            if feedback:
                user_message += f"\n\nAdditional feedback: {feedback}"
            
            # Call the LLM
            response = await self.llm.achat([
                ChatMessage(role=MessageRole.SYSTEM, content=system_prompt),
                ChatMessage(role=MessageRole.USER, content=user_message)
            ])
            
            # Parse the response
            try:
                # Extract JSON from the response
                json_str = response.message.content.strip()
                # Sometimes the response might be wrapped in markdown code blocks
                if '```json' in json_str:
                    json_str = json_str.split('```json')[1].split('```')[0].strip()
                elif '```' in json_str:
                    json_str = json_str.split('```')[1].split('```')[0].strip()
                
                data = json.loads(json_str)
                return data
                
            except json.JSONDecodeError as e:
                print(f"Failed to parse JSON response: {response.message.content}")
                raise ValueError(f"Failed to parse JSON response: {str(e)}")
                
        except Exception as e:
            print(f"Error in _extract_invoice_data: {str(e)}")
            raise
