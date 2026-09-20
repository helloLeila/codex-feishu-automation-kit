const response = await fetch("http://127.0.0.1:3210/api/health");

if (!response.ok) {
  process.exit(1);
}
