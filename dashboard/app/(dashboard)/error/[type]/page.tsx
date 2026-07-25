"use client";

import { Link2Off, Clock, MailX, AlertTriangle, MailCheck } from "lucide-react";
import ErrorScreen from "@/components/ErrorScreen";
import { useParams } from "next/navigation";

export default function ErrorView() {
  const { type } = useParams();

  if (type === "email-sent") {
    return (
      <ErrorScreen
        title="Check Your Email"
        description="We've sent a verification link to your new email address. Please click the link to verify your email."
        icon={<MailCheck className="w-12 h-12 text-blue-500" />}
        primaryActionText="Back to Security"
        primaryActionLink="/security"
      />
    );
  }

  if (type === "invalid-link") {
    return (
      <ErrorScreen
        title="Invalid Link"
        description="The link you followed is invalid or malformed. Please request a new link from your account settings or contact support if you need assistance."
        icon={<Link2Off className="w-12 h-12 text-red-500" />}
      />
    );
  }

  if (type === "expired") {
    return (
      <ErrorScreen
        title="Link Expired"
        description="For your security, verification links expire after 24 hours. This link is no longer active. Please request a new link to continue."
        icon={<Clock className="w-12 h-12 text-orange-500" />}
      />
    );
  }

  if (type === "invalid-email") {
    return (
      <ErrorScreen
        title="Invalid Email Address"
        description="We couldn't verify this email address. It may have been entered incorrectly or no longer exists. Please try again with a valid email."
        icon={<MailX className="w-12 h-12 text-red-500" />}
      />
    );
  }

  return (
    <ErrorScreen
      title="An Error Occurred"
      description="Something went wrong while processing your request. Please try again later."
      code="500"
      icon={<AlertTriangle className="w-12 h-12 text-red-500" />}
    />
  );
}
