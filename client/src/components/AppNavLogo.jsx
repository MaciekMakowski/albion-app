import { NavLink } from "react-router-dom";

const AppNavLogo = () => {
  return (
    <NavLink
      to="/"
      className="fantasy-nav-logo"
      style={{ textDecoration: "none" }}
    >
      <i>ALLbeON.me</i>
    </NavLink>
  );
};

export default AppNavLogo;
