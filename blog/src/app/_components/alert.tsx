import Container from "@/app/_components/container";

type Props = {
  preview?: boolean;
};

const Alert = ({ preview }: Props) => {
  return (
    <div className={preview ? "article-alert article-alert--preview" : "article-alert"}>
      <Container>
        <div className="article-alert__inner">
          {preview ? (
            <>
              This page is a preview.{" "}
              <a href="/api/exit-preview">
                Click here
              </a>{" "}
              to exit preview mode.
            </>
          ) : (
            <>
              MakeChurchEasy helps churches prepare Bible presentations,
              worship lyrics, media, and live streams.
            </>
          )}
        </div>
      </Container>
    </div>
  );
};

export default Alert;
