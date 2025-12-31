import nodemailer from "nodemailer"
import { Environment } from "../../../utils/environment";
import { render } from "@react-email/render";
const transporter = nodemailer.createTransport({
  service: Environment.email.service,
  auth: {
    user: Environment.email.user,
    pass: Environment.email.password,
  },
});
interface SendMailProps {
  to: string;
  subject: string;
  reactEmail: any
}
export const sendMail = async ({subject, to, reactEmail}: SendMailProps) => {
  await transporter.sendMail({
    from: `App <${Environment.email.user}>`,
    subject: subject,
    to: to,
    html: await render(reactEmail),
  })
}