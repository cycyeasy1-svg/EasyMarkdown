# Image Resolution Fixture

The image below uses a document-relative path. The editor must resolve it to a
display-only `file://` URL (see `components/editor-images.js`), so the E2E suite
can assert the rendered `<img src>` starts with `file://`.

![sample](./assets/sample.png)
