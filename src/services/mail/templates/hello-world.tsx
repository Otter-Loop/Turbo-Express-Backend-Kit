import { Html, Head, Preview, Body, Container, Section, Text, Button } from "@react-email/components";
import { Tailwind } from "@react-email/tailwind";

interface Props {
  name: string;
  email: string;
  docLink: string;
}

export const WelcomeTemplate = ({ name, email, docLink }: Props) => {
  return (
    <Html>
      <Head />
      <Preview>Welcome to our platform!</Preview>
      <Tailwind>
        <Body className="bg-gray-100 font-sans">
          <Container className="mx-auto my-10 p-5 bg-white rounded-lg shadow-sm max-w-xl">
            <Section>
              <Text className="text-2xl font-bold text-gray-800">Welcome, {name}!</Text>
              <Text className="text-gray-600 text-base leading-6 my-4">
                We're thrilled to have you join us. Your account is now set up with the email <strong>{email}</strong>.
                Get started by visiting docs and exploring what we have to offer.
              </Text>
              <Section className="text-center my-8">
                <Button
                  className="bg-green-600 text-white px-6 py-3 rounded-md font-semibold text-sm no-underline"
                  href={docLink}
                >
                  Go to docs
                </Button>
              </Section>
              <Text className="text-gray-500 text-sm">
                If the button above doesn't work, copy and paste this link into your browser:
                <br />
                <span className="text-green-500 break-all">{docLink}</span>
              </Text>
              <hr className="border-gray-200 my-6" />
              <Text className="text-gray-400 text-xs">
                We're excited to have you with us. Let's make your experience amazing!
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};
