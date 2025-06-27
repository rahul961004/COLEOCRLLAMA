const { parse } = require('path');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');
const fetch = require('node-fetch');
const fsExtra = require('fs-extra');

// Create temp directory if it doesn't exist
const tempDir = path.join(os.tmpdir(), 'llama-ocr');
fsExtra.ensureDirSync(tempDir);

// Parse form data
const parseForm = async (event) => {
  return new Promise((resolve, reject) => {
    const form = new Formidable.IncomingForm();
    form.uploadDir = tempDir;
    form.keepExtensions = true;
    
    form.parse(event.rawBody, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
};

// Process the invoice using LlamaCloud API
exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    // Parse form data
    const form = new FormData();
    const boundary = event.headers['content-type'].split('boundary=')[1];
    form._boundary = boundary;
    
    const fileData = Buffer.from(event.body, 'base64');
    const filename = `invoice-${uuidv4()}.pdf`; // or get from content-disposition
    const filepath = path.join(tempDir, filename);
    
    await fs.promises.writeFile(filepath, fileData);
    
    // Call LlamaCloud API
    const apiKey = process.env.LLAMA_CLOUD_API_KEY;
    if (!apiKey) {
      throw new Error('LLAMA_CLOUD_API_KEY environment variable is not set');
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filepath), {
      filename: filename,
      contentType: 'application/pdf'
    });
    formData.append('language', 'en');
    formData.append('premium_mode', 'true');

    const response = await fetch('https://api.llamacloud.ai/v1/parse', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    
    // Clean up temp file
    await fs.promises.unlink(filepath).catch(console.error);
    
    return {
      statusCode: 200,
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
      body: JSON.stringify({
        status: 'error',
        message: error.message || 'Failed to process invoice',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
