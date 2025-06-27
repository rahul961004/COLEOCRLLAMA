const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const FormData = require('form-data');

// Helper function to parse multipart form data
const parseMultipartFormData = (event) => {
  console.log('Parsing multipart form data...');
  
  if (!event.body) {
    throw new Error('No request body found');
  }
  
  if (!event.headers || !event.headers['content-type']) {
    throw new Error('Content-Type header is missing');
  }

  // Extract boundary from content-type header
  const contentType = event.headers['content-type'];
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  
  if (!boundaryMatch) {
    throw new Error('No boundary found in Content-Type header');
  }
  
  const boundary = '--' + boundaryMatch[1].trim();
  console.log('Boundary:', boundary);

  // Handle base64 encoded body if needed
  const body = event.isBase64Encoded 
    ? Buffer.from(event.body, 'base64').toString('binary')
    : event.body;
    
  console.log('Body length:', body.length);

  // Split the body into parts using the boundary
  const parts = body.split(boundary);
  console.log('Found parts:', parts.length);
  
  let fileData = null;
  let filename = `invoice-${uuidv4()}.pdf`;
  let fileContentType = 'application/octet-stream';

  for (const part of parts) {
    if (!part || part.trim() === '' || part.includes('--')) {
      continue;
    }
    
    // Extract headers and content
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    
    const headers = part.substring(0, headerEnd);
    const content = part.substring(headerEnd + 4).trim();
    
    // Check if this part contains a file
    if (headers.includes('filename=')) {
      // Extract filename
      const filenameMatch = headers.match(/filename=["']?([^"'\r\n]+)/i);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].trim();
      }
      
      // Extract content type
      const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
      if (contentTypeMatch && contentTypeMatch[1]) {
        fileContentType = contentTypeMatch[1].trim();
      }
      
      // Get the file content (remove trailing boundary if exists)
      const contentEnd = content.lastIndexOf('\r\n');
      const fileContent = contentEnd !== -1 ? content.substring(0, contentEnd) : content;
      
      fileData = Buffer.from(fileContent, 'binary');
      console.log(`Found file: ${filename}, type: ${fileContentType}, size: ${fileData.length} bytes`);
      break;
    }
  }

  if (!fileData) {
    console.error('No file data found in the request');
    throw new Error('No file data found in request');
  }

  return { 
    fileData, 
    filename, 
    contentType: fileContentType 
  };
};

// Process the invoice using LlamaCloud API
exports.handler = async (event, context) => {
  console.log('Received request:', {
    httpMethod: event.httpMethod,
    path: event.path,
    headers: event.headers,
    isBase64Encoded: event.isBase64Encoded,
    bodyLength: event.body ? event.body.length : 0
  });

  // Set CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    const error = 'Method Not Allowed';
    console.error('Error:', error);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error })
    };
  }

  try {
    console.log('Processing file upload...');
    
    // Parse the uploaded file
    const { fileData, filename, contentType } = parseMultipartFormData(event);
    console.log(`File parsed successfully: ${filename}, type: ${contentType}, size: ${fileData.length} bytes`);
    
    // Create form data for LlamaCloud API
    const form = new FormData();
    form.append('file', fileData, {
      filename,
      contentType: contentType || 'application/octet-stream'
    });
    form.append('language', 'en');
    form.append('premium_mode', 'true');

    // Call LlamaCloud API
    const apiKey = process.env.LLAMA_CLOUD_API_KEY;
    if (!apiKey) {
      const error = 'LLAMA_CLOUD_API_KEY environment variable is not set';
      console.error('Error:', error);
      throw new Error(error);
    }

    console.log('Sending request to LlamaCloud API...');
    const apiUrl = 'https://api.llamacloud.ai/v1/parse';
    const apiHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      ...form.getHeaders()
    };

    console.log('API Request:', {
      url: apiUrl,
      method: 'POST',
      headers: {
        ...apiHeaders,
        'Authorization': 'Bearer [REDACTED]' // Don't log the actual API key
      },
      body: `[FormData with ${fileData.length} bytes]`
    });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: apiHeaders,
      body: form
    });

    const responseText = await response.text();
    console.log(`API Response: ${response.status}`, responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} - ${responseText}`);
    }

    const result = JSON.parse(responseText);
    console.log('Processing completed successfully');
    
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
