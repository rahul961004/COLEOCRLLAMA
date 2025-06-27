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

  // Handle OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight request handled' })
    };
  }

  try {
    console.log('Processing file upload...');
    
    // Parse the uploaded file
    const parsedData = parseMultipartFormData(event);
    console.log('File parsed successfully:', {
      fileName: parsedData.filename,
      mimeType: parsedData.contentType,
      size: parsedData.content.length
    });

    // Create form data for LlamaCloud API
    const form = new FormData();
    form.append('file', parsedData.content, {
      filename: parsedData.filename,
      contentType: parsedData.contentType
    });
    form.append('language', 'en');
    form.append('premium_mode', 'true');

    // Convert form data to buffer
    const formBuffer = form.getBuffer();
    const formHeaders = form.getHeaders();
    console.log('Form headers:', formHeaders);

    // Function to make the API request
    const makeRequest = (useIp = false) => {
      return new Promise((resolve, reject) => {
        const options = {
          hostname: useIp ? '34.107.221.82' : 'api.llamacloud.ai',
          path: '/v1/parse',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.LLAMA_CLOUD_API_KEY}`,
            'Accept': 'application/json',
            'Content-Type': formHeaders['content-type'],
            'Content-Length': formBuffer.length,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            ...(useIp ? { 'Host': 'api.llamacloud.ai' } : {})
          },
          rejectUnauthorized: false, // Disable SSL verification
          timeout: 30000,
          ciphers: 'ALL',
          secureOptions: require('constants').SSL_OP_NO_TLSv1 | require('constants').SSL_OP_NO_TLSv1_1
        };
        
        console.log('Making request to:', useIp ? '34.107.221.82' : 'api.llamacloud.ai');

        const req = https.request(options, (res) => {
          let data = [];
          
          res.on('data', (chunk) => {
            data.push(chunk);
          });

          res.on('end', () => {
            try {
              const response = Buffer.concat(data).toString();
              console.log('Response:', response);
              
              // Check if we got HTML instead of JSON
              if (response.includes('<html>') || response.includes('<!DOCTYPE html>')) {
                console.error('Received HTML response instead of JSON');
                reject(new Error('Received HTML response instead of JSON'));
                return;
              }
              
              const parsedResponse = JSON.parse(response);
              resolve(parsedResponse);
            } catch (err) {
              console.error('Error parsing response:', err);
              reject(new Error(`Failed to parse response: ${err.message}`));
            }
          });
        });

        req.on('error', (err) => {
          console.error('Request error:', err);
          reject(err);
        });

        // Write data to request body
        req.write(formBuffer);
        req.end();
      });
    };

    // Try direct connection first
    try {
      console.log('Trying direct connection to LlamaCloud API...');
      const response = await makeRequest(false);
      return response.data;
    } catch (error) {
      console.error('Direct connection failed, trying with IP address...', error.message);
      
      // Try with IP address if direct connection fails
      try {
        console.log('Trying with direct IP connection...');
        const response = await makeRequest(true);
        return response.data;
        
      } catch (ipError) {
        console.error('IP-based connection failed:', ipError.message);
        if (ipError.response) {
          console.error('Response status:', ipError.response.status);
          console.error('Response data:', ipError.response.data);
        }
        throw new Error(`Failed to connect to LlamaCloud API: ${ipError.message}`);
      }
    }
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
