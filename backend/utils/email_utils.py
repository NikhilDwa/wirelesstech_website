import requests

from utils.logger_utils import Logger
from utils.path_utils import PathUtils

config: dict = PathUtils().get_configuration()
resend_config: dict = config["RESEND"]

RESEND_API_URL = "https://api.resend.com/emails"


class EmailUtils:
    def __init__(self):
        log_namespace = self.__class__.__name__
        self.logger = Logger(log_namespace, f"{log_namespace}.log").get()
        self.api_key: str = resend_config["api_key"]
        # Falls back to CRON_EMAIL.from if RESEND.from isn't set, so existing
        # config files don't need both filled in to keep working.
        self.from_email: str = resend_config.get("from") or config["CRON_EMAIL"]["from"]

    def send_transactional_email(
        self, to: str, subject_request: str, message_request: str
    ) -> None:
        """
        Sends an email via the Resend API, with error handling and logging.

        Args:
            to (str): Email address of the recipient to whom the email will be sent.
            subject_request (str): Parameter to specify the subject of the email that will be sent.
            message_request (str): Actual content or body of the email that you want to send.

        Return:
            None
        """
        self.logger.info(
            f"inside send_transactional_email method..........to: {to}, subject_request: {subject_request}"
        )
        if not self.api_key:
            self.logger.error("RESEND api_key is not configured; email not sent.")
            return
        try:
            response = requests.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": self.from_email,
                    "to": [to],
                    "subject": subject_request,
                    "text": message_request,
                },
                timeout=10,
            )
            if response.status_code >= 400:
                self.logger.error(
                    f"Resend API returned {response.status_code} sending to {to}: {response.text}"
                )
            else:
                self.logger.info("Email sent successfully via Resend")
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
