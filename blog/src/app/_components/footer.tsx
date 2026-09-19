import Container from "@/app/_components/container";

export function Footer() {
  return (
    <footer className="site-footer">
      <Container>
        <div className="site-footer__inner">
          <h2>
            Make church services easier to prepare, present, and run.
          </h2>
          <div className="site-footer__actions">
            <a
              href="https://makechurcheazy.com"
              className="button-primary"
            >
              Visit MakeChurchEasy
            </a>
            <a
              href="/feed.xml"
              className="button-secondary"
            >
              Subscribe to feed
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}

export default Footer;
