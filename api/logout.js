
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }

  res.setHeader(
    "Set-Cookie",
    "hail_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );

  res.status(200).json({ success: true });
}
