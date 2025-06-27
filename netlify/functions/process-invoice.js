const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');
const axios = require('axios');
const https = require('https');

// Helper function to parse multipart form data
const parseMultipartFormData = (event) => {
  console.log('Parsing request...');
  console.log('Headers:', JSON.stringify(event.headers, null, 2));
  console.log('Is base64 encoded:', event.isBase64Encoded);
  
  if (!event.body) {
    throw new Error('No request body found');
  }

  // Handle base64 encoded body
  const body = event.isBase64Encoded 
    ? Buffer.from(event.body, 'base64').toString('binary')
    : event.body;
    
  console.log('Body length:', body.length);
  
  // If the body is empty or too small, throw an error
  if (!body || body.length < 10) {
    throw new Error('Request body is empty or too small');
  }

  // Try to find the boundary from Content-Type header
  let boundary = null;
  if (event.headers && event.headers['content-type']) {
    const contentType = event.headers['content-type'];
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
    if (boundaryMatch && boundaryMatch[1]) {
      boundary = '--' + boundaryMatch[1].trim();
      console.log('Found boundary in header:', boundary);
    }
  }
  
  // If no boundary in header, try to find it in the body
  if (!boundary) {
    const firstLine = body.split('\r\n')[0];
    if (firstLine && firstLine.startsWith('--')) {
      boundary = firstLine.trim();
      console.log('Found boundary in body:', boundary);
    }
  }
  
  if (!boundary) {
    console.error('No boundary found in request');
    // If we can't find a boundary, try to process as direct file upload
    return {
      fileData: Buffer.from(event.isBase64Encoded ? event.body : Buffer.from(event.body).toString('base64'), 'base64'),
      filename: `invoice-${uuidv4()}.pdf`,
      contentType: event.headers['content-type'] || 'application/octet-stream'
    };
  }

  // Split the body into parts using the boundary
  const parts = body.split(boundary);
  console.log('Found parts:', parts.length);
  
  let fileData = null;
  let filename = `invoice-${uuidv4()}.pdf`;
  let fileContentType = 'application/octet-stream';

  for (const part of parts) {
    if (!part || part.trim() === '' || part.trim().endsWith('--')) {
      continue;
    }
    
    // Extract headers and content
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    
    const headers = part.substring(0, headerEnd);
    const content = part.substring(headerEnd + 4);
    
    // Check if this part contains a file
    if (headers.includes('filename=')) {
      // Extract filename
      const filenameMatch = headers.match(/filename=["']?([^"'\r\n]+)/i);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].trim().replace(/[^\w\d.-]/g, '_');
      }
      
      // Extract content type
      const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
      if (contentTypeMatch && contentTypeMatch[1]) {
        fileContentType = contentTypeMatch[1].trim();
      }
      
      // Get the file content
      fileData = Buffer.from(content, 'binary');
      console.log(`Found file: ${filename}, type: ${fileContentType}, size: ${fileData.length} bytes`);
      break;
    }
  }

  if (!fileData) {
    console.error('No file data found in the request');
    // If no file found in multipart, try to use the raw body
    if (body.length > 0) {
      console.log('Using raw body as file data');
      fileData = Buffer.from(body, 'binary');
      filename = `invoice-${uuidv4()}.${fileContentType.split('/').pop() || 'bin'}`;
    } else {
      throw new Error('No file data found in request');
    }
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

    // Prepare the form data
    const formData = new FormData();
    formData.append('file', fileData, { filename: fileName, contentType: mimeType });
    formData.append('language', 'en');
    formData.append('premium_mode', 'true');

    // Convert form data to buffer
    const formBuffer = formData.getBuffer();
    const formHeaders = formData.getHeaders();

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
            ...(useIp ? { 'Host': 'api.llamacloud.ai' } : {})
          },
          rejectUnauthorized: false, // Disable SSL verification
          timeout: 30000
        };

        const req = https.request(options, (res) => {
          let data = [];
          
          res.on('data', (chunk) => {
            data.push(chunk);
          });

          res.on('end', () => {
            try {
              const response = Buffer.concat(data).toString();
              const result = JSON.parse(response);
              console.log(`API Response Status: ${res.statusCode}`);
              resolve({
                status: res.statusCode,
                data: result,
                headers: res.headers
              });
            } catch (e) {
              console.error('Error parsing response:', e);
              reject(new Error(`Failed to parse response: ${e.message}`));
            }
          });
        });

        req.on('error', (error) => {
          console.error('Request error:', error);
          reject(error);
        });

        // Set a timeout for the request
        req.setTimeout(30000, () => {
          req.destroy(new Error('Request timeout'));
        });

        // Write the form data
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
