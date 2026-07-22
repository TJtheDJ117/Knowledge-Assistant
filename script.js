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

let chosenFile = null;
let toastTimer = null;

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
  chosenFile = null;
  fileInput.value = '';
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

function setFile(file) {
  if (!file) return;
  chosenFile = file;
  const extension = file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : 'FILE';
  selectedFileName.textContent = file.name;
  selectedFileMeta.textContent = `${extension} · ${(file.size / 1024 / 1024).toFixed(2)} MB · ready to upload`;
  selectedFile.hidden = false;
  uploadButton.disabled = false;
  if (!isSupported(file)) {
    showToast('error', 'File not supported', 'Please choose a PDF or DOCX file under 10 MB.');
  }
}

removeFile.addEventListener('click', () => {
  clearSelectedFile();
});

fileInput.addEventListener('change', (event) => setFile(event.target.files[0]));

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
dropZone.addEventListener('drop', (event) => setFile(event.dataTransfer.files[0]));

toastClose.addEventListener('click', () => toast.classList.remove('show'));

uploadButton.addEventListener('click', () => {
  if (!chosenFile) return;
  if (!isSupported(chosenFile)) {
    showToast('error', 'File not supported', 'Please choose a PDF or DOCX file under 10 MB.');
    return;
  }

  const uploadedFileName = chosenFile.name;
  resetProgress();
  uploaderWrap.classList.add('is-uploading');
  uploadButton.disabled = true;
  let progress = 0;
  const progressTimer = window.setInterval(() => {
    progress += Math.floor(Math.random() * 13) + 7;
    if (progress >= 100) {
      progress = 100;
      window.clearInterval(progressTimer);
      progressStatus.textContent = 'Your document is ready to use.';
      window.setTimeout(() => {
        uploaderWrap.classList.remove('is-uploading');
        clearSelectedFile();
        showToast('success', 'Document uploaded', `${uploadedFileName} is ready in your workspace.`);
      }, 500);
    } else {
      progressStatus.textContent = progress < 48 ? 'Reading document contents...' : 'Securing your upload...';
    }
    progressFill.style.width = `${progress}%`;
    progressPercent.textContent = `${progress}%`;
  }, 220);
});
