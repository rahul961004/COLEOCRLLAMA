const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Process the invoice using LlamaCloud API
exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    // Parse the multipart form data
    const boundary = event.headers['content-type'].split('boundary=')[1];
    if (!boundary) {
      throw new Error('No boundary found in content-type header');
    }
    
    // Get the file from the form data
    const fileMatch = event.body.match(/filename="([^"]+)"[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/);
    if (!fileMatch) {
      throw new Error('No file found in request');
    }
    
    const filename = fileMatch[1] || `invoice-${uuidv4()}.pdf`;
    const fileData = Buffer.from(fileMatch[2], 'binary');
    
    // Create form data for LlamaCloud API
    const form = new FormData();
    form.append('file', fileData, {
      filename: filename,
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
      body: form.getBuffer()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'error',
        message: error.message || 'Failed to process invoice',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
