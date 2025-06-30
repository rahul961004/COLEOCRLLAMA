# Invoice Processor with OpenAI Assistants

A modern web application that processes invoices using OpenAI's powerful assistants. The application extracts structured data from invoice images/PDFs and converts them into well-formatted Excel files using a two-step assistant workflow.

## Features

- **Drag & Drop Interface**: Simple and intuitive UI for uploading invoice files
- **AI-Powered Processing**: Uses OpenAI's GPT-4o with vision for accurate data extraction
- **Two-Step Workflow**: 
  1. **Data Extraction**: Extracts structured data from invoices using Cole OCR Bot
  2. **Excel Generation**: Converts extracted data into formatted Excel files using Cole Excel Maker
- **Multi-format Support**: Handles PDF, JPG, and PNG files
- **Responsive Design**: Works on both desktop and mobile devices

## Prerequisites

- Node.js 18+
- Netlify account (for deployment)
- OpenAI API key with access to Assistants API

## Local Development

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Llama-OCR
   ```

2. Install dependencies for Netlify functions:
   ```bash
   cd netlify/functions
   npm install
   cd ../..
   ```

3. Create a `.env` file in the root directory:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. Install Netlify CLI (if you want to test locally):
   ```bash
   npm install -g netlify-cli
   ```

5. Start the local development server:
   ```bash
   netlify dev
   ```
   The application will be available at `http://localhost:8888`

## Deployment

1. Push your code to a GitHub repository
2. Connect the repository to Netlify
3. Set the following environment variables in Netlify:
   - `OPENAI_API_KEY`: Your OpenAI API key
4. Deploy the site

## Project Structure

```
.
├── netlify/
│   └── functions/             # Serverless functions
│       ├── process-invoice.js # Main invoice processing function
│       └── package.json       # Function dependencies
├── frontend.js               # Frontend JavaScript
├── index.html                # Main HTML file
├── netlify.toml              # Netlify configuration
└── README.md                 # This file
```

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key with access to Assistants API (required)

## How It Works

1. User uploads an invoice file (PDF, JPG, or PNG)
2. The file is sent to the Netlify function
3. The function uses two OpenAI assistants in sequence:
   - **Cole OCR Bot**: Extracts structured data from the invoice
   - **Cole Excel Maker**: Converts the extracted data into a formatted Excel file
4. The generated Excel file is returned to the user for download

## Example Usage

1. Open the application in your browser
2. Drag and drop an invoice file or click to select one
3. Click "Process Files"
4. Wait for processing to complete
5. Download the generated Excel file

## License

MIT
