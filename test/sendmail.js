const API_BASE = "http://localhost:4010/api/v1";
const API_KEY = process.env.APPSZONE_MAIL_KEY; // keep this server-side

async function sendEmail() {
    const res = await fetch(`${API_BASE}/mails/send`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
            from: "sales@appszonebd.com",
            to: ["syedamirali473@gmail.com"],
            cc: ["boss@appszonebd.com"],
            subject: "Welcome aboard 🎉",
            bodyType: "EMBED_HTML",
            body: "<h1>Hi there</h1><p>Thanks for signing up.</p>",
        }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Send failed (${res.status}): ${JSON.stringify(err.message)}`);
    }

    const message = await res.json();
    console.log("Queued:", message.id, message.status);
    return message;
}

sendEmail().catch(console.error);
