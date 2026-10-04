// alerts.js
// Shared SweetAlert2 helpers. Load SweetAlert2 first, then this file.
// Colors, fonts, and shapes are controlled by the SweetAlert block in Common.css.

// Success popup. Returns a promise, so you can redirect after it closes:
// showSuccess("Account created!").then(() => location.href = "Account.html");
function showSuccess(message, title = "Success!") {
  return Swal.fire({ icon: "success", title: title, text: message });
}

// Error popup
function showError(message, title = "Oops...") {
  return Swal.fire({ icon: "error", title: title, text: message });
}

// Warning / info popups
function showWarning(message, title = "Heads up") {
  return Swal.fire({ icon: "warning", title: title, text: message });
}

function showInfo(message, title = "Info") {
  return Swal.fire({ icon: "info", title: title, text: message });
}

// Yes/No confirmation. Resolves to true or false:
// if (await confirmAction("Log out?", "You will need to sign in again.")) { ... }
async function confirmAction(
  title = "Are you sure?",
  message = "",
  confirmText = "Yes",
  cancelText = "Cancel"
) {
  const result = await Swal.fire({
    icon: "question",
    title: title,
    text: message,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
  });
  return result.isConfirmed;
}

// Loading spinner (no buttons). Close it with closeAlert():
// showLoading("Signing you in..."); ... closeAlert();
function showLoading(message = "Please wait...") {
  Swal.fire({
    title: message,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });
}

function closeAlert() {
  Swal.close();
}

// Small toast in the top-right corner, auto-dismisses
function showToast(message, icon = "success") {
  Swal.fire({
    toast: true,
    position: "top-end",
    icon: icon,
    title: message,
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
  });
}