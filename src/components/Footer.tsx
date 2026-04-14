const Footer = () => {
  return (
    <footer className="border-t border-border/50 py-6 px-4 text-center text-sm text-muted-foreground font-body">
      <p>&copy; {new Date().getFullYear()} Alpha Squad. All rights reserved.</p>
    </footer>
  );
};

export default Footer;
