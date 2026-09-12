from typing import List, Sequence, Union

import requests

from utils.logger_utils import Logger
from utils.path_utils import PathUtils

config: dict = PathUtils().get_configuration()
resend_config: dict = config["RESEND"]

RESEND_API_URL = "https://api.resend.com/emails"

# Resend accepts at most 50 addresses in a single "to"
MAX_RECIPIENTS = 50

Recipients = Union[str, Sequence[str], None]


def as_recipients(value: Recipients) -> List[str]:
    """
    Normalise a recipient config value into a clean list of addresses.

    Accepts any of the three shapes a config file might reasonably use:
        to : someone@example.com                      -> ["someone@example.com"]
        to : [one@example.com, two@example.com]       -> ["one@example.com", "two@example.com"]
        to : "one@example.com, two@example.com"       -> ["one@example.com", "two@example.com"]

    Blank entries are dropped and duplicates are removed while keeping the
    original order, so a repeated address never produces a duplicate send.

    Args:
        value: A single address, a list of addresses, or a comma-separated string.

    Return:
        List[str]: Cleaned, de-duplicated addresses (possibly empty).
    """
    if value is None:
        return []
    if isinstance(value, str):
        parts = value.split(",")
    elif isinstance(value, Sequence):
        # A YAML list may hold comma-separated strings, so flatten both levels.
        # A dangling "- " entry parses as None and must be dropped, not stringified.
        parts = [
            piece
            for item in value
            if item is not None
            for piece in str(item).split(",")
        ]
    else:
        parts = [str(value)]

    seen: set = set()
    cleaned: List[str] = []
    for part in parts:
        address = part.strip()
        if address and address.lower() not in seen:
            seen.add(address.lower())
            cleaned.append(address)
    return cleaned


class EmailUtils:
    def __init__(self):
        log_namespace = self.__class__.__name__
        self.logger = Logger(log_namespace, f"{log_namespace}.log").get()
        self.api_key: str = resend_config["api_key"]
        # Falls back to CRON_EMAIL.from if RESEND.from isn't set, so existing
        # config files don't need both filled in to keep working.
        self.from_email: str = resend_config.get("from") or config["CRON_EMAIL"]["from"]

    def send_transactional_email(
        self, to: Recipients, subject_request: str, message_request: str
    ) -> None:
        """
        Sends an email via the Resend API, with error handling and logging.

        Args:
            to: Recipient(s). A single address, a list of addresses, or a
                comma-separated string — all three are accepted. Every recipient
                receives the same message and can see the others in the To header;
                use separate calls if the addresses must stay private from each other.
            subject_request (str): Parameter to specify the subject of the email that will be sent.
            message_request (str): Actual content or body of the email that you want to send.

        Return:
            None
        """
        recipients = as_recipients(to)
        self.logger.info(
            f"inside send_transactional_email method..........to: {recipients}, "
            f"subject_request: {subject_request}"
        )
        if not self.api_key:
            self.logger.error("RESEND api_key is not configured; email not sent.")
            return
        if not recipients:
            self.logger.error(
                f"No valid recipient configured for '{subject_request}'; email not sent."
            )
            return
        if len(recipients) > MAX_RECIPIENTS:
            self.logger.warning(
                f"{len(recipients)} recipients exceeds Resend's limit of {MAX_RECIPIENTS}; "
                f"sending to the first {MAX_RECIPIENTS} only."
            )
            recipients = recipients[:MAX_RECIPIENTS]
        try:
            response = requests.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": self.from_email,
                    "to": recipients,
                    "subject": subject_request,
                    "text": message_request,
                },
                timeout=10,
            )
            if response.status_code >= 400:
                self.logger.error(
                    f"Resend API returned {response.status_code} sending to "
                    f"{recipients}: {response.text}"
                )
            else:
                self.logger.info(
                    f"Email sent successfully via Resend to {len(recipients)} recipient(s)"
                )
        except requests.RequestException:
            self.logger.exception("Error sending email via Resend.")

    def send_email(self, email_message: str) -> None:
        """
        Sends a dev/cron notification email to the configured recipient.

        Args:
            email_message (str): Message to be sent in email.

        Return:
            None
        """
        self.logger.info(f"inside send_email method..........email_message: {email_message}")
        self.send_transactional_email(
            to=config["CRON_EMAIL"]["to"],
            subject_request="Wireless Code Generation",
            message_request=email_message,
        )

    def send_email_with_subject(self, email_subject: str, email_message: str) -> None:
        self.logger.info(
            f"inside send_email_with_subject method..........email_message: {email_message}"
        )
        self.send_transactional_email(
            to=config["CRON_EMAIL"]["report_to"],
            subject_request=email_subject,
            message_request=email_message,
        )
