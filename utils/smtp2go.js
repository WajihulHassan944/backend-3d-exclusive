export const sendEmailSMTP2GO = async ({
  to,
  subject,
  html,
  text,
}) => {
  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: process.env.SMTP2GO_API_KEY,
      to: Array.isArray(to) ? to : [to],
      sender: process.env.SMTP2GO_SENDER,
      subject,
      html_body: html,
      text_body: text,
    }),
  });

  const data = await response.json();

  if (!data.data || data.data.failed > 0) {
    console.error("SMTP2GO Error:", data);
    throw new Error("SMTP2GO email failed");
  }

  return data;
};
