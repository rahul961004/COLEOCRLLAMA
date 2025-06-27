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

    // Function to submit document and get job ID
    const submitDocument = (useIp = false) => {
      return new Promise((resolve, reject) => {
        const apiKey = process.env.LLAMA_CLOUD_API_KEY;
        console.log('Using API key:', apiKey ? '*****' + apiKey.slice(-4) : 'NO API KEY');
        
        const options = {
          hostname: useIp ? '34.107.221.82' : 'api.llamacloud.ai',
          path: '/api/v1/parsing/job',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
            'Content-Type': formHeaders['content-type'],
            'Content-Length': formBuffer.length,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            ...(useIp ? { 'Host': 'api.llamacloud.ai' } : {})
          },
          agent: new https.Agent({
            rejectUnauthorized: false,
            keepAlive: true,
            maxSockets: 10,
            timeout: 30000
          }),
          ciphers: 'ALL',
          secureOptions: require('constants').SSL_OP_NO_TLSv1 | require('constants').SSL_OP_NO_TLSv1_1
        };
        
        console.log('Submitting document to:', useIp ? '34.107.221.82' : 'api.llamacloud.ai');
        console.log('Request options:', options);

        const req = https.request(options, (res) => {
          let data = [];
          
          console.log('Submission response status:', res.statusCode);
          console.log('Submission response headers:', res.headers);
          
          if (res.statusCode !== 200) {
            console.error(`Submission error: ${res.statusCode}`);
            reject(new Error(`Submission error: ${res.statusCode}`));
            return;
          }
          
          res.on('data', (chunk) => {
            data.push(chunk);
          });

          res.on('end', () => {
            try {
              const response = Buffer.concat(data).toString();
              console.log('Submission response:', response);
              const parsedResponse = JSON.parse(response);
              resolve(parsedResponse.job_id);
            } catch (err) {
              console.error('Error parsing submission response:', err);
              reject(new Error(`Failed to parse submission response: ${err.message}`));
            }
          });
        });

        req.on('error', (err) => {
          console.error('Submission error:', err);
          reject(err);
        });

        req.write(formBuffer);
        req.end();
      });
    };

    // Function to get job result
    const getJobResult = (jobId, useIp = false) => {
      return new Promise((resolve, reject) => {
        const apiKey = process.env.LLAMA_CLOUD_API_KEY;
        const options = {
          hostname: useIp ? '34.107.221.82' : 'api.llamacloud.ai',
          path: `/api/v1/parsing/job/${jobId}/result/markdown`,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            ...(useIp ? { 'Host': 'api.llamacloud.ai' } : {})
          },
          agent: new https.Agent({
            rejectUnauthorized: false,
            keepAlive: true,
            maxSockets: 10,
            timeout: 30000
          }),
          ciphers: 'ALL',
          secureOptions: require('constants').SSL_OP_NO_TLSv1 | require('constants').SSL_OP_NO_TLSv1_1
        };
        
        console.log('Getting job result for:', jobId);
        console.log('Request options:', options);

        const req = https.request(options, (res) => {
          let data = [];
          
          console.log('Result response status:', res.statusCode);
          console.log('Result response headers:', res.headers);
          
          if (res.statusCode !== 200) {
            console.error(`Result error: ${res.statusCode}`);
            reject(new Error(`Result error: ${res.statusCode}`));
            return;
          }
          
          res.on('data', (chunk) => {
            data.push(chunk);
          });

          res.on('end', () => {
            try {
              const response = Buffer.concat(data).toString();
              console.log('Result response:', response);
              const parsedResponse = JSON.parse(response);
              resolve(parsedResponse);
            } catch (err) {
              console.error('Error parsing result response:', err);
              reject(new Error(`Failed to parse result response: ${err.message}`));
            }
          });
        });

        req.on('error', (err) => {
          console.error('Result error:', err);
          reject(err);
        });

        req.end();
      });
    };

    // Try direct connection first
    try {
      console.log('Trying direct connection to LlamaCloud API...');
      const jobId = await submitDocument(false);
      const result = await getJobResult(jobId, false);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'success',
          message: 'Invoice processed successfully',
          data: {
            json: response,
            markdown: response.markdown || '',
            text: response.text || ''
          }
        })
      };
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
