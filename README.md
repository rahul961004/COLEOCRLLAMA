# Invoice Processing with LlamaExtract

An intelligent invoice processing system that extracts structured data from invoices using LlamaExtract's advanced OCR and LLM capabilities, validates the data, and stores it in an Excel file.

## Features

- **Advanced OCR & Data Extraction**: Uses LlamaExtract for state-of-the-art document understanding and data extraction
- **Structured Output**: Extracts data into well-defined Pydantic models for type safety
- **Multi-format Support**: Processes PDF, JPG, and PNG files
- **Data Validation**: Validates the extracted data for completeness and correctness
- **Excel Export**: Saves the processed data to an Excel file
- **REST API**: Provides a simple API for processing and downloading invoices

## Prerequisites

- Python 3.8+
- Llama Cloud API key (for LlamaExtract service)
- OpenAI API key (for LLM processing)

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Llama-OCR
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Create a `.env` file with your API keys:
   ```
   # Required: Get this from https://cloud.llamaindex.ai/
   LLAMA_CLOUD_API_KEY=your_llama_cloud_api_key_here
   
   # Optional: Only needed if you want to use OpenAI for additional processing
   # OPENAI_API_KEY=your_openai_api_key_here
   ```

## Usage

### Command Line

```bash
python workflow.py --invoice path/to/your/invoice.pdf --output output/invoices.xlsx
```

### Web API

1. Start the FastAPI server:
   ```bash
   uvicorn app:app --reload
   ```

2. API Endpoints

- `POST /process-invoice/` - Process an uploaded invoice file (PDF, JPG, PNG)
- `GET /download/{filename}` - Download a processed Excel file
- `GET /health` - Health check endpoint

## Project Structure

```
.
├── agents/                    # Agent implementations
│   ├── __init__.py
│   ├── base_agent.py          # Base class for all agents
│   ├── llama_extract_agent.py # Handles document processing using LlamaExtract (OCR + data extraction)
│   ├── data_validation_agent.py # Validates the extracted data
│   ├── excel_writer_agent.py   # Writes data to Excel
├── app.py                     # FastAPI application
├── workflow.py                # Workflow orchestration
├── requirements.txt           # Python dependencies
└── README.md                 # This file
```

## Environment Variables

- `LLAMA_CLOUD_API_KEY`: Your Llama Cloud API key (required)
- `OPENAI_API_KEY`: Your OpenAI API key (optional, for additional processing)

## Example Request

```bash
# Process an invoice
curl -X POST "http://localhost:8000/process-invoice/" \
     -H "accept: application/json" \
     -H "Content-Type: multipart/form-data" \
     -F "file=@path/to/your/invoice.pdf"

# Download the processed Excel file
curl -O http://localhost:8000/download/invoices.xlsx
```

## License

MIT
