import React from 'react';
import AppRouter from './AppRouter';

function App() {
	return (
		<div className="flex h-screen bg-gray-50 dark:bg-gray-900">
			<AppRouter />
		</div>
	);
}

// function Home() {
// 	return (
// 		<>
// 			<main>
// 				<h2>Welcome to the homepage!</h2>
// 				<p>You can do this, I believe in you.</p>
// 			</main>
// 			<nav>
// 				<Link to="/about">About</Link>
// 			</nav>
// 		</>
// 	);
// }

// function About() {
// 	return (
// 		<>
// 			<main>
// 				<h2>Who are we?</h2>
// 				<p>That feels like an existential question, don't you think?</p>
// 			</main>
// 			<nav>
// 				<Link to="/">Home</Link>
// 			</nav>
// 		</>
// 	);
// }

export default App;
