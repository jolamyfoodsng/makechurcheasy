import { Church } from "lucide-react";

interface HeaderProps {
  onSkipSetup: () => void;
  currentStep: number;
}

export default function Header({ onSkipSetup, currentStep }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50 transition-colors duration-200">
      <div className="flex justify-between items-center w-full px-6 md:px-8 py-4 max-w-6xl mx-auto">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity">
          <Church className="text-primary-brand w-8 h-8 md:w-9 md:h-9 stroke-[2]" />
          <span className="text-xl md:text-2xl font-display font-bold text-primary-brand tracking-tight">
            MakeChurchEasy
          </span>
        </div>

        {/* Global Nav Links */}
        <div className="flex items-center gap-4 md:gap-8">
          <nav className="hidden sm:flex items-center gap-6">
            <a
              href="#help"
              className="text-gray-500 hover:text-primary-brand-dark transition-colors text-sm font-medium"
              onClick={(e) => {
                e.preventDefault();
                alert("Need help? Feel free to contact support@makechurcheasy.org");
              }}
            >
              Help
            </a>
            <a
              href="#support"
              className="text-gray-500 hover:text-primary-brand-dark transition-colors text-sm font-medium"
              onClick={(e) => {
                e.preventDefault();
                alert("Accessing support channels...");
              }}
            >
              Support
            </a>
          </nav>

          {currentStep < 7 && (
            <button
              onClick={onSkipSetup}
              className="text-gray-500 hover:text-primary-brand-dark transition-all text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50 active:scale-95"
            >
              Skip Setup
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
