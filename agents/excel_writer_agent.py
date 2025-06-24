import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional
from .base_agent import BaseAgent, Context
import os

class ExcelWriterAgent(BaseAgent):
    """Agent responsible for writing validated data to Excel"""
    
    def __init__(self):
        super().__init__("ExcelWriterAgent")
    
    async def process(self, context: Context) -> Context:
        """Write the validated data to the specified Excel file"""
        print(f"{self.name}: Starting Excel write operation...")
        
        if not context.structured_data:
            raise ValueError("No structured data found in context")
            
        if not context.excel_sheet_path:
            raise ValueError("No Excel sheet path provided in context")
        
        try:
            # Create directory if it doesn't exist
            excel_path = Path(context.excel_sheet_path)
            excel_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write data to Excel
            await self._append_to_excel(
                str(excel_path),
                context.structured_data
            )
            
            print(f"{self.name}: Successfully wrote data to {excel_path}")
            return context
            
        except Exception as e:
            print(f"{self.name}: Error writing to Excel: {str(e)}")
            raise
    
    async def _append_to_excel(self, file_path: str, data: Dict[str, Any]) -> None:
        """Append data to an Excel file, creating it if it doesn't exist"""
        try:
            # Convert data to DataFrame
            df_data = self._flatten_data(data)
            
            # Check if file exists
            if os.path.exists(file_path):
                # Read existing data
                existing_df = pd.read_excel(file_path, engine='openpyxl')
                # Append new data
                df = pd.concat([existing_df, pd.DataFrame([df_data])], ignore_index=True)
            else:
                # Create new DataFrame
                df = pd.DataFrame([df_data])
            
            # Write to Excel
            df.to_excel(file_path, index=False, engine='openpyxl')
            
        except Exception as e:
            print(f"Error in _append_to_excel: {str(e)}")
            raise
    
    def _flatten_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Flatten the nested data structure for Excel export"""
        flat_data = {}
        
        # Add top-level fields
        for key in ['invoice_number', 'date', 'vendor_name', 'total_amount']:
            flat_data[key] = data.get(key)
        
        # Flatten line items
        if 'line_items' in data and isinstance(data['line_items'], list):
            for i, item in enumerate(data['line_items'], 1):
                if isinstance(item, dict):
                    for field in ['description', 'quantity', 'unit_price', 'total_price']:
                        flat_data[f'item_{i}_{field}'] = item.get(field)
        
        return flat_data
