/**
 * PWA HTML Template
 * Placeholders: {{STYLES}}, {{SCRIPT}}
 */

export const PWA_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Create Post - Second Rodeo</title>

  <!-- PWA Manifest -->
  <link rel="manifest" href="/manifest.json">

  <!-- iOS PWA Support -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="Second Rodeo">
  <link rel="apple-touch-icon" href="/favicon.svg">

  <style>{{STYLES}}</style>
</head>
<body>
  <h1>Create Post</h1>

  <div id="status">Loading...</div>
  <div id="error"></div>

  <form id="form" onsubmit="submitForm(event)">
    <label for="title">Title (optional)</label>
    <input type="text" id="title" placeholder="Optional title">

    <label for="content">Content *</label>
    <textarea id="content" rows="5" placeholder="What's happening?" required></textarea>

    <button type="submit" class="primary">Create Post</button>
  </form>

  <button id="location-btn" onclick="requestLocation()">
    Enable Location
  </button>

  <div id="places"></div>

  <script>{{SCRIPT}}</script>
</body>
</html>`;
