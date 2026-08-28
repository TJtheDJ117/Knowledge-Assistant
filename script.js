const fileInput = document.querySelector('#fileInput');
const dropZone = document.querySelector('#dropZone');
const uploadButton = document.querySelector('#uploadButton');
const selectedFile = document.querySelector('#selectedFile');
const selectedFileName = document.querySelector('#selectedFileName');
const selectedFileMeta = document.querySelector('#selectedFileMeta');
const removeFile = document.querySelector('#removeFile');
const uploaderWrap = document.querySelector('.uploader-wrap');
const progressFill = document.querySelector('#progressFill');
const progressPercent = document.querySelector('#progressPercent');
const progressStatus = document.querySelector('#progressStatus');
const toast = document.querySelector('#toast');
const toastIcon = document.querySelector('#toastIcon');
const toastKicker = document.querySelector('#toastKicker');
const toastTitle = document.querySelector('#toastTitle');
const toastMessage = document.querySelector('#toastMessage');
const toastClose = document.querySelector('#toastClose');
const documentList = document.querySelector('#documentList');
const refreshDocuments = document.querySelector('#refreshDocuments');
const selectionCount = document.querySelector('#selectionCount');
const apiBaseUrl = 'http://127.0.0.1:8000';

let chosenFiles = [];
let toastTimer = null;
const maxBatchUploads = 5;

async function loadDocuments() {
  if (!documentList) return;

  try {
    const response = await fetch(`${apiBaseUrl}/documents`);
    const documents = await response.json();

    if (!response.ok) {
      throw new Error(documents?.detail || 'Unable to load documents.');
    }

    if (!documents.length) {
      documentList.innerHTML = '<div class="empty-state">No uploaded documents yet. Add your first PDF or DOCX file.</div>';
      return;
    }

    documentList.innerHTML = documents.map((document) => {
      const categoryName = document.category || 'General';
      const categoryClass = `category-${categoryName.toLowerCase().replace(/\s+/g, '-')}`;
      const fileExtension = (document.filename.split('.').pop() || 'FILE').toUpperCase();
      const iconClass = (fileExtension === 'PDF' ? 'pdf' : fileExtension === 'DOCX' ? 'docx' : fileExtension === 'TXT' ? 'txt' : 'file');
      return `
        <div class="document-item">
          <div class="document-meta">
            <span class="document-icon ${iconClass}">${fileExtension}</span>
            <div class="document-info">
              <div class="document-name">${document.filename}</div>
              <div class="document-size">${(Number(document.size) / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          </div>
          <div class="document-actions">
            <span class="document-category ${categoryClass}">${categoryName}</span>
            <button class="delete-document" type="button" data-filename="${document.filename}">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    documentList.querySelectorAll('.delete-document').forEach((button) => {
      button.addEventListener('click', async () => {
        const filename = button.dataset.filename;
        try {
          const deleteResponse = await fetch(`${apiBaseUrl}/documents/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
          });
          const payload = await deleteResponse.json().catch(() => ({}));
          if (!deleteResponse.ok) {
            throw new Error(payload?.detail || 'Unable to delete document.');
          }
          showToast('success', 'Document removed', `${filename} was deleted from your workspace.`);
          loadDocuments();
        } catch (error) {
          showToast('error', 'Delete failed', error.message || 'Please try again.');
        }
      });
    });
  } catch (error) {
    documentList.innerHTML = '<div class="empty-state">Unable to load documents right now.</div>';
    showToast('error', 'Workspace error', error.message || 'Please refresh later.');
  }
}

function isSupported(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  return ['pdf', 'docx'].includes(extension) && file.size <= 10 * 1024 * 1024;
}

function showToast(type, title, message) {
  window.clearTimeout(toastTimer);
  const successful = type === 'success';
  toast.classList.toggle('success', successful);
  toastIcon.textContent = successful ? '✓' : '!';
  toastKicker.textContent = successful ? 'UPLOAD COMPLETE' : 'UPLOAD ERROR';
  toastTitle.textContent = title;
  toastMessage.textContent = message;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 5200);
}

function clearSelectedFile() {
  chosenFiles = [];
  fileInput.value = '';
  selectionCount.textContent = '0 FILES SELECTED';
  selectedFile.hidden = true;
  uploadButton.disabled = true;
}

function resetProgress() {
  progressFill.style.transition = 'none';
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';
  progressStatus.textContent = 'Preparing your document...';
  requestAnimationFrame(() => {
    progressFill.style.transition = 'width 0.2s linear';
  });
}

function setFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const existingNames = new Set(chosenFiles.map((file) => file.name));
  const newFiles = files.filter((file) => !existingNames.has(file.name));
  const combinedFiles = [...chosenFiles, ...newFiles];

  if (combinedFiles.length > maxBatchUploads) {
    showToast('error', 'Upload limit reached', 'You can select a maximum of 5 documents at a time.');
    return;
  }

  chosenFiles = combinedFiles;
  selectionCount.textContent = `${chosenFiles.length} DOCUMENT${chosenFiles.length === 1 ? '' : 'S'} SELECTED`;
  selectedFile.querySelector('.selected-files-list').innerHTML = `
      ${chosenFiles.map((file) => {
        const extension = file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : 'FILE';
        const fileTypeClass = (extension === 'PDF' ? 'pdf' : extension === 'DOCX' ? 'docx' : 'file');
        return `<div class="selected-file-row"><span class="file-badge ${fileTypeClass}" aria-hidden="true">${extension}</span><span class="file-summary"><strong>${file.name}</strong><span>${(file.size / 1024 / 1024).toFixed(2)} MB</span></span></div>`;
      }).join('')}
  `;
  selectedFile.hidden = false;
  uploadButton.disabled = false;
  if (newFiles.some((file) => !isSupported(file))) {
    showToast('error', 'File not supported', 'Please choose PDF or DOCX files under 10 MB.');
  }
}

removeFile.addEventListener('click', clearSelectedFile);

fileInput.addEventListener('change', (event) => setFiles(event.target.files));

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('drop-active');
  });
});
['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('drop-active');
  });
});
dropZone.addEventListener('drop', (event) => setFiles(event.dataTransfer.files));

toastClose.addEventListener('click', () => toast.classList.remove('show'));
refreshDocuments.addEventListener('click', loadDocuments);

loadDocuments();

uploadButton.addEventListener('click', async () => {
  if (!chosenFiles.length) return;
  if (chosenFiles.length > maxBatchUploads || chosenFiles.some((file) => !isSupported(file))) {
    showToast('error', 'Upload not available', 'Please choose up to 5 PDF or DOCX files under 10 MB each.');
    return;
  }

  const uploadedFileCount = chosenFiles.length;
  resetProgress();
  uploaderWrap.classList.add('is-uploading');
  uploadButton.disabled = true;
  progressStatus.textContent = `Uploading and categorizing ${uploadedFileCount} document${uploadedFileCount === 1 ? '' : 's'}...`;
  progressFill.style.width = '20%';
  progressPercent.textContent = '20%';

  try {
    const formData = new FormData();
    chosenFiles.forEach((file) => formData.append('files', file));

    const response = await fetch(`${apiBaseUrl}/uploads`, {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || 'The upload could not be completed.');
    }

    progressFill.style.width = '100%';
    progressPercent.textContent = '100%';
    progressStatus.textContent = `${uploadedFileCount} document${uploadedFileCount === 1 ? '' : 's'} processed successfully.`;
    clearSelectedFile();
    showToast('success', 'Documents uploaded', `${uploadedFileCount} document${uploadedFileCount === 1 ? '' : 's'} classified and added to your workspace.`);
    loadDocuments();
  } catch (error) {
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.textContent = 'Upload failed.';
    showToast('error', 'Upload failed', error.message || 'Please try again.');
  } finally {
    uploaderWrap.classList.remove('is-uploading');
    uploadButton.disabled = !chosenFiles.length;
  }
});
