from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class Context:
    """Shared context for workflow state management"""
    invoice_path: str
    excel_sheet_path: str
    extracted_text: Optional[str] = None
    structured_data: Optional[Dict[str, Any]] = None
    validation_feedback: Optional[str] = None

class BaseAgent(ABC):
    """Base class for all agents in the workflow"""
    
    def __init__(self, name: str):
        self.name = name
    
    @abstractmethod
    async def process(self, context: Context) -> Context:
        """Process the context and return updated context"""
        pass
