import Link from "next/link";
import { ThemeSwitcher } from "./theme-switcher";

const Header = () => {
  return (
    <header className="site-header">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 sm:px-7 lg:px-8 site-header__inner">
        <Link href="/" className="site-brand" aria-label="MakeChurchEasy Blog home">
          <span className="site-brand__mark" aria-hidden="true">MCE</span>
          <span className="site-brand__copy">
            MakeChurchEasy <span>/ Blog</span>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/" className="site-nav__link">Latest articles</Link>
          <a className="site-nav__link" href="https://makechurcheazy.com">Product</a>
          <ThemeSwitcher />
        </nav>
      </div>
    </header>
  );
};

export default Header;
