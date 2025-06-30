document.addEventListener('DOMContentLoaded', () => {
  const dropArea = document.getElementById('drop-area');
  const fileInput = document.getElementById('file-input');
  const fileList = document.getElementById('file-list');
  const processBtn = document.getElementById('process-btn');
  const statusDiv = document.getElementById('status');
  const resultDiv = document.getElementById('result');

  let files = [];

  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  // Highlight drop area when item is dragged over it
  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
  });

  // Handle dropped files
  dropArea.addEventListener('drop', handleDrop, false);
  dropArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect, false);
  processBtn.addEventListener('click', processFiles);
  
  // Add paste event listener to the whole document
  document.addEventListener('paste', (e) => {
    // Only handle if the paste is not in an input or textarea
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      handlePaste(e);
    }
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function highlight() {
    dropArea.classList.add('highlight');
  }

  function unhighlight() {
    dropArea.classList.remove('highlight');
  }

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const newFiles = Array.from(dt.files);
    handleNewFiles(newFiles);
  }

  function handleFileSelect(e) {
    const newFiles = Array.from(e.target.files);
    handleNewFiles(newFiles);
    // Reset the input to allow selecting the same file again
    e.target.value = '';
  }

  function handlePaste(e) {
    const items = (e.clipboardData || window.clipboardData).items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const blob = item.getAsFile();
        if (blob && (blob.type.startsWith('image/') || blob.type === 'application/pdf')) {
          // Create a new file with a proper name
          const fileName = `pasted-${Date.now()}.${blob.type.split('/')[1] || 'png'}`;
          const file = new File([blob], fileName, { type: blob.type });
          handleNewFiles([file]);
          break;
        }
      }
    }
  }

  function handleNewFiles(newFiles) {
    if (newFiles && newFiles.length > 0) {
      // Filter out non-PDF and non-image files
      const validFiles = newFiles.filter(file => 
        file.type.startsWith('image/') || file.type === 'application/pdf'
      );
      
      if (validFiles.length > 0) {
        files = [...files, ...validFiles];
        updateFileList();
      } else if (newFiles.length > 0) {
        showStatus('Please upload only image or PDF files', 'error');
      }
    }
  }

  function updateFileList() {
    fileList.innerHTML = '';
    files.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          fileItem.innerHTML = `
            <div class="file-info">
              <img src="${e.target.result}" class="file-preview" alt="Preview">
              <span>${file.name} (${(file.size / 1024).toFixed(2)} KB)</span>
            </div>
            <button class="remove-btn" data-index="${index}">×</button>
          `;
          // Add event listener to the remove button
          fileItem.querySelector('.remove-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            files.splice(index, 1);
            updateFileList();
          });
        };
        reader.readAsDataURL(file);
      } else {
        fileItem.innerHTML = `
          <div class="file-info">
            <span>${file.name} (${(file.size / 1024).toFixed(2)} KB)</span>
          </div>
          <button class="remove-btn" data-index="${index}">×</button>
        `;
        // Add event listener to the remove button
        fileItem.querySelector('.remove-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          files.splice(index, 1);
          updateFileList();
        });
      }
      
      fileList.appendChild(fileItem);
    });

    processBtn.disabled = files.length === 0;
  }

  async function processFiles() {
    if (files.length === 0) {
      showStatus('Please add files to process', 'error');
      return;
    }

    processBtn.disabled = true;
    showStatus('Processing files... This may take a minute.', 'info');
    resultDiv.innerHTML = '';

    try {
      const formData = new FormData();
      
      // Add each file to the form data
      files.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch('/.netlify/functions/process-invoice', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        let errorMsg = 'Failed to process files';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorData.message || errorMsg;
        } catch (e) {
          errorMsg = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMsg);
      }

      // Handle the response as a blob (for file download)
      const blob = await response.blob();
      
      // Check if the response is actually an Excel file
      if (blob.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
          blob.type === 'application/octet-stream') {
        const url = window.URL.createObjectURL(blob);
        
        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
        showStatus('Processing complete! File downloaded.', 'success');
      } else {
        // If the response is not an Excel file, try to read it as text
        const text = await blob.text();
        console.error('Unexpected response:', text);
        throw new Error('The server returned an unexpected response format');
      }
      
    } catch (error) {
      console.error('Error processing files:', error);
      showStatus(`Error: ${error.message || 'Failed to process files. Please try again.'}`, 'error');
    } finally {
      processBtn.disabled = false;
    }
  }
});
