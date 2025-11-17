import nodeMailer from "nodemailer";
import ejs from "ejs";
import { promises as fs } from "fs";

const sendEmail = async (options) => {
  try {
    const transporter = nodeMailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // important for 465
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 20000,
      socketTimeout: 30000,
    });

    const template = await fs.readFile(options.templatePath, "utf-8");

    const html = ejs.render(template, options.templateData);

    const mailOptions = {
      from: process.env.SMTP_MAIL,
      to: options.email,
      subject: options.subject,
      html: html,
    };
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

export default sendEmail;
