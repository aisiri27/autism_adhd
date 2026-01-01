// Show selected file name under upload box
document.getElementById("image-upload").addEventListener("change", function () {
    let fileFeedback = document.getElementById("file-feedback");

    if (this.files && this.files.length > 0) {
        fileFeedback.innerHTML = `📄 ${this.files[0].name}`;
        fileFeedback.style.display = "block";
    } else {
        fileFeedback.innerHTML = "";
        fileFeedback.style.display = "none";
    }
});
