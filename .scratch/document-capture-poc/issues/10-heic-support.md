# 10: HEIC support

**What to build:** A presenter can photograph a receipt with an iPhone and upload the HEIC file live. The browser converts it to JPEG before upload, so the user never sees a format error.

**Blocked by:** 02

**Status:** done

- [x] HEIC/HEIF files are converted to JPEG in the browser before the size check and upload
- [x] The stored Document keeps the original file name with a .jpg extension and an image/jpeg MIME type
- [x] A failed conversion shows a Thai message instead of uploading

**Not verified:** converting a real iPhone HEIC photo (no sample could be produced on the dev machine). The decode failure path, the Thai message and the bundle loading were checked in the browser. Test once with a real iPhone photo.
