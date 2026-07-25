export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-100 mt-auto py-6">
      <div className="flex flex-col md:flex-row justify-between items-center w-full px-6 md:px-8 max-w-6xl mx-auto text-gray-400 text-xs md:text-sm gap-4">
        {/* Copyright notice */}
        <div className="font-medium text-center md:text-left text-gray-500">
          © {currentYear} MakeChurchEasy. All rights reserved.
        </div>

        {/* Action Links */}
        <div className="flex gap-6 justify-center">
          <a
            href="#privacy"
            className="hover:text-primary-brand transition-colors font-medium focus:underline focus:outline-none"
            onClick={(e) => {
              e.preventDefault();
              alert("Displaying Privacy Policy summary: your data stays completely private and secure.");
            }}
          >
            Privacy Policy
          </a>
          <a
            href="#terms"
            className="hover:text-primary-brand transition-colors font-medium focus:underline focus:outline-none"
            onClick={(e) => {
              e.preventDefault();
              alert("Displaying Terms of Service summary: by utilizing and setting up MakeChurchEasy, you consent to standard user guidelines.");
            }}
          >
            Terms of Service
          </a>
          <a
            href="#contact"
            className="hover:text-primary-brand transition-colors font-medium focus:underline focus:outline-none"
            onClick={(e) => {
              e.preventDefault();
              alert("Contact us: team@makechurcheasy.org");
            }}
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
