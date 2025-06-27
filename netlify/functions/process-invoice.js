const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const FormData = require('form-data');

// Process the invoice using LlamaCloud API
exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    // Parse the multipart form data
    if (!event.body || !event.headers['content-type']) {
      throw new Error('Invalid request: Missing body or content-type header');
    }

    // Get the file from the form data
    const boundary = event.headers['content-type'].split('boundary=')[1];
    if (!boundary) {
      throw new Error('No boundary found in content-type header');
    }

    // Simple parsing of multipart form data
    const parts = event.body.split(`--${boundary}`);
    let fileData = null;
    let filename = `invoice-${uuidv4()}.pdf`;

    for (const part of parts) {
      if (part.includes('filename=')) {
        const filenameMatch = part.match(/filename="([^"]+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
        const match = part.match(/\r\n\r\n([\s\S]*?)\r\n--/);
        if (match && match[1]) {
          fileData = Buffer.from(match[1]);
          break;
        }
      }
    }

    if (!fileData) {
      throw new Error('No file data found in request');
    }

    // Create form data for LlamaCloud API
    const form = new FormData();
    form.append('file', fileData, {
      filename,
      contentType: 'application/pdf'
    });
    form.append('language', 'en');
    form.append('premium_mode', 'true');

    // Call LlamaCloud API
    const apiKey = process.env.LLAMA_CLOUD_API_KEY;
    if (!apiKey) {
      throw new Error('LLAMA_CLOUD_API_KEY environment variable is not set');
    }

    const response = await fetch('https://api.llamacloud.ai/v1/parse', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders()
      },
      body: form
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'success',
        message: 'Invoice processed successfully',
        data: {
          json: result,
          markdown: result.markdown || '',
          text: result.text || ''
        }
      })
    };
    
  } catch (error) {
    console.error('Error processing invoice:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        status: 'error',
        message: error.message || 'Failed to process invoice',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
