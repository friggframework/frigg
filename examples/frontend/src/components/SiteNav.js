import React from 'react';
import { NavLink } from 'react-router-dom';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import NavDropdown from 'react-bootstrap/NavDropdown';
// import Form from 'react-bootstrap/Form';
// import Button from 'react-bootstrap/Button';
// import FormControl from 'react-bootstrap/FormControl';

//
// the top bar on the site that handles site navigation.
// see the react bootstrap docs for more info:
//    https://react-bootstrap.github.io/components/navbar/
//
export default function SiteNav() {
    return (
        <Navbar sticky="top" bg="light" expand="lg">
            <Navbar.Brand>
                <img src="/FriggLogo.svg" width="125" alt="" />
            </Navbar.Brand>
            <Navbar.Toggle aria-controls="basic-navbar-nav" />
            <Navbar.Collapse id="basic-navbar-nav">
                <Nav className="mr-auto">
                    <Nav.Link>
                        <NavLink className="nav-link" to="/dashboard">
                            Dashboard
                        </NavLink>
                    </Nav.Link>

                    <Nav.Link>
                        <NavLink className="nav-link" to="/logout">
                            Log Out
                        </NavLink>
                    </Nav.Link>

                    <NavDropdown
                        title="Actions"
                        id="basic-nav-dropdown"
                        className="nav-link"
                    >
                        <NavDropdown.Item>
                            <NavLink className="nav-link" to="/page3">
                                Page3
                            </NavLink>
                        </NavDropdown.Item>

                        <NavDropdown.Divider />

                        <NavDropdown.Item>
                            <NavLink className="nav-link" to="/page4">
                                Page4
                            </NavLink>
                        </NavDropdown.Item>
                    </NavDropdown>
                </Nav>

                {/* <Form inline> */}
                {/*    <FormControl type="text" placeholder="Search" className="mr-sm-2" /> */}
                {/*    <Button variant="outline-success">Search</Button> */}
                {/* </Form> */}
            </Navbar.Collapse>
        </Navbar>
    );
}
