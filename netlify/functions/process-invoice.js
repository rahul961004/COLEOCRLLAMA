const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');
const axios = require('axios');
const https = require('https');

// Helper function to parse multipart form data
const parseMultipartFormData = (event) => {
  console.log('Parsing request...');
  const headers = event.headers || {};
  console.log('Content-Type:', headers['content-type']);
  
  if (!event.body) {
    console.error('No body in request');
    throw new Error('No body in request');
  }
  
  // Get the raw body
  const rawBody = event.isBase64Encoded 
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body);
    
  console.log('Is base64 encoded:', event.isBase64Encoded);
  console.log('Raw body length:', rawBody.length);
  
  // Get boundary from content-type header
  const contentType = headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=([^;\s]+)/i);
  
  if (!boundaryMatch) {
    console.error('No boundary found in content-type header');
    throw new Error('No boundary found in content-type header');
  }
  
  const boundary = '--' + boundaryMatch[1];
  console.log('Using boundary:', boundary);
  
  // Convert buffer to string for easier parsing
  const bodyStr = rawBody.toString('binary');
  const parts = bodyStr.split(boundary);
  console.log(`Found ${parts.length} parts`);
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    
    // Skip empty parts
    if (!part || part === '--') continue;
    
    // Check if this part contains a file
    if (part.includes('filename=')) {
      // Extract filename
      const filenameMatch = part.match(/filename=["']?([^"'\r\n]*)/i);
      const filename = filenameMatch ? filenameMatch[1] : 'invoice.pdf';
      
      // Extract content type
      const contentTypeMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
      const fileContentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
      
      // Find the start of the file content (after the headers)
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      
      // Extract the file content (everything after headers and before the next boundary)
      let content = part.substring(headerEnd + 4);
      
      // Remove trailing boundary if present
      const nextBoundaryIndex = content.indexOf('\r\n--');
      if (nextBoundaryIndex !== -1) {
        content = content.substring(0, nextBoundaryIndex);
      }
      
      // Convert content to buffer
      const fileBuffer = Buffer.from(content, 'binary');
      console.log(`Found file: ${filename}, type: ${fileContentType}, size: ${fileBuffer.length} bytes`);
      
      return {
        content: fileBuffer,
        filename: filename,
        contentType: fileContentType
      };
    }
  }
  
  // If we get here, no file was found in the multipart data
  console.error('No file found in the request');
  throw new Error('No file found in the request');
};

// Process the invoice using LlamaCloud API
exports.handler = async (event, context) => {
  try {
    console.log('Received request:', event);
    
    // Handle CORS
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': true
        },
        body: ''
      };
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Method not allowed' })
      };
    }

    // Parse multipart form data
    console.log('Processing file upload...');
    console.log('Parsing request...');

    const contentType = event.headers['content-type'];
    console.log('Content-Type:', contentType);
    console.log('Is base64 encoded:', event.isBase64Encoded);
    console.log('Raw body length:', event.bodyLength);

    // Check if it's multipart form data
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
      throw new Error('Invalid content type');
    }

    const boundary = contentType.split('boundary=')[1];
    console.log('Using boundary:', boundary);

    // Decode base64 body if needed
    let body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);
    console.log('Decoded body length:', body.length);

    // Split parts using boundary
    const parts = body.toString().split(`--${boundary}`);
    console.log('Found', parts.length - 2, 'parts');

    // Find the file part
    let fileData = null;
    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i].trim();
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;

      const headers = part.substring(0, headerEnd);
      const content = part.substring(headerEnd + 4);

      // Check if this is the file part
      if (headers.includes('filename="')) {
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        const contentTypeMatch = headers.match(/Content-Type: ([^\r\n]+)/);

        if (filenameMatch && contentTypeMatch) {
          fileData = {
            fileName: filenameMatch[1],
            mimeType: contentTypeMatch[1],
            content: Buffer.from(content)
          };
          break;
        }
      }
    }

    if (!fileData) {
      throw new Error('No file data found in request');
    }

    console.log('File parsed successfully:', {
      fileName: fileData.fileName,
      mimeType: fileData.mimeType,
      size: fileData.content.length
    });

    // Initialize LlamaCloud client
    const client = new LlamaCloud({
      apiKey: process.env.LLAMA_CLOUD_API_KEY,
      baseUrl: 'https://api.llamacloud.ai',
      timeout: 30000
    });

    try {
      console.log('Processing document with LlamaCloud...');
      
      // Submit the document
      const result = await client.parseDocument({
        file: fileData.content,
        filename: fileData.fileName,
        outputFormat: 'markdown'
      });

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'success',
          message: 'Invoice processed successfully',
          data: {
            markdown: result.markdown || '',
            text: result.text || '',
            metadata: result.job_metadata || {}
          }
        })
      };
    } catch (error) {
      console.error('LlamaCloud processing error:', error);
      
      // Try with IP fallback if DNS resolution fails
      if (error.code === 'ENOTFOUND') {
        console.log('Trying with IP fallback...');
        
        // Update client with IP address
        client.config.baseUrl = 'https://34.107.221.82';
        client.config.rejectUnauthorized = false;

        try {
          const result = await client.parseDocument({
            file: fileData.content,
            filename: fileData.fileName,
            outputFormat: 'markdown'
          });

          return {
            statusCode: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              status: 'success',
              message: 'Invoice processed successfully',
              data: {
                markdown: result.markdown || '',
                text: result.text || '',
                metadata: result.job_metadata || {}
              }
            })
          };
        } catch (ipError) {
          console.error('IP-based connection failed:', ipError);
          return {
            statusCode: 500,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              status: 'error',
              message: 'Failed to connect to LlamaCloud API',
              error: ipError.message
            })
          };
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error processing invoice:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'error',
        message: 'Error processing invoice',
        error: error.message,
        stack: error.stack
      })
    };
  }
};
