import * as THREE from 'three';

import TWEEN from 'three/addons/libs/tween.module.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

import { CONFIG } from './config.js';

const $ = ( id ) => document.getElementById( id );

function waitForGoogle() {

	return new Promise( ( resolve, reject ) => {

		const started = Date.now();

		( function check() {

			if ( window.google && window.google.accounts && window.google.accounts.id ) return resolve();
			if ( Date.now() - started > 10000 ) return reject( new Error( 'Google sign-in script failed to load.' ) );
			setTimeout( check, 100 );

		} )();

	} );

}

// Decode the (base64url, UTF-8) payload of the Google ID token to show the user's name.
function decodeJwt( token ) {

	const payload = token.split( '.' )[ 1 ].replace( /-/g, '+' ).replace( /_/g, '/' );
	const bytes = Uint8Array.from( atob( payload ), ( c ) => c.charCodeAt( 0 ) );
	return JSON.parse( new TextDecoder().decode( bytes ) );

}

function showLoginError( message ) {

	const el = $( 'loginError' );
	el.textContent = message;
	el.hidden = false;

}

async function initLogin() {

	try {

		await waitForGoogle();

	} catch ( err ) {

		showLoginError( err.message );
		return;

	}

	google.accounts.id.initialize( {
		client_id: CONFIG.CLIENT_ID,
		callback: onCredential,
	} );

	google.accounts.id.renderButton( $( 'googleButton' ), {
		type: 'standard',
		theme: 'filled_blue',
		size: 'large',
		text: 'signin_with',
		shape: 'rectangular',
		logo_alignment: 'left',
		width: 240,
	} );

}

async function onCredential( response ) {

	let profile;

	try {

		profile = decodeJwt( response.credential );

	} catch ( err ) {

		showLoginError( 'Sign-in failed. Please try again.' );
		return;

	}

	$( 'userName' ).textContent = profile.name || profile.email || '';
	$( 'login' ).hidden = true;
	$( 'app' ).hidden = false;

	$( 'signOut' ).addEventListener( 'click', () => {

		google.accounts.id.disableAutoSelect();
		window.location.reload();

	} );

	await startApp();

}

function parseMoney( value ) {

	// "$251,260.80" -> 251260.8
	const n = parseFloat( String( value ).replace( /[^0-9.\-]/g, '' ) );
	return Number.isFinite( n ) ? n : 0;

}

async function fetchPeople() {

	const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent( CONFIG.SHEET_ID ) +
		'/values/' + encodeURIComponent( CONFIG.SHEET_RANGE ) + '?key=' + encodeURIComponent( CONFIG.API_KEY );

	const res = await fetch( url );

	if ( ! res.ok ) {

		let detail = '';
		try { detail = ( await res.json() ).error.message; } catch ( e ) { /* ignore */ }
		throw new Error( 'Could not load the Google Sheet (' + res.status + '). ' + detail );

	}

	const rows = ( await res.json() ).values || [];
	if ( rows.length < 2 ) throw new Error( 'The Google Sheet has no data rows.' );

	const header = rows[ 0 ].map( ( h ) => String( h ).trim().toLowerCase() );
	const col = ( name ) => header.indexOf( name );
	const idx = {
		name: col( 'name' ), photo: col( 'photo' ), age: col( 'age' ),
		country: col( 'country' ), interest: col( 'interest' ), worth: col( 'net worth' ),
	};

	if ( Object.values( idx ).some( ( i ) => i < 0 ) ) {

		throw new Error( 'Sheet header must be: Name, Photo, Age, Country, Interest, Net Worth.' );

	}

	return rows.slice( 1 )
		.filter( ( r ) => r[ idx.name ] && String( r[ idx.name ] ).trim() )
		.map( ( r ) => ( {
			name: String( r[ idx.name ] ).trim(),
			photo: String( r[ idx.photo ] || '' ).trim(),
			age: String( r[ idx.age ] || '' ).trim(),
			country: String( r[ idx.country ] || '' ).trim(),
			interest: String( r[ idx.interest ] || '' ).trim(),
			netWorth: parseMoney( r[ idx.worth ] ),
		} ) );

}

// Red < $100K, Orange > $100K, Green > $200K
function tierFor( netWorth ) {

	if ( netWorth > 200000 ) return 'green';
	if ( netWorth > 100000 ) return 'orange';
	return 'red';

}

let camera, scene, renderer, controls;

const objects = [];
const targets = { table: [], sphere: [], helix: [], grid: [] };

async function startApp() {

	const status = $( 'status' );

	try {

		const people = await fetchPeople();
		status.hidden = true;
		init( people );
		animate();

	} catch ( err ) {

		status.textContent = err.message;
		status.classList.add( 'error' );

	}

}

function createTile( person ) {

	const element = document.createElement( 'div' );
	element.className = 'element ' + tierFor( person.netWorth );
	element.title = person.name + ' - $' + person.netWorth.toLocaleString( 'en-US', { minimumFractionDigits: 2 } );

	const meta = document.createElement( 'div' );
	meta.className = 'meta';
	const country = document.createElement( 'span' );
	country.textContent = person.country;
	const age = document.createElement( 'span' );
	age.textContent = person.age;
	meta.append( country, age );
	element.appendChild( meta );

	const photo = document.createElement( 'img' );
	photo.className = 'photo';
	photo.alt = person.name;
	photo.loading = 'lazy';
	photo.referrerPolicy = 'no-referrer';
	if ( /^https?:\/\//i.test( person.photo ) ) photo.src = person.photo;
	photo.addEventListener( 'error', () => { photo.style.visibility = 'hidden'; } );
	element.appendChild( photo );

	const name = document.createElement( 'div' );
	name.className = 'name';
	name.textContent = person.name;
	element.appendChild( name );

	const interest = document.createElement( 'div' );
	interest.className = 'interest';
	interest.textContent = person.interest;
	element.appendChild( interest );

	return element;

}

function init( people ) {

	const count = people.length;

	const aspect = window.innerWidth / window.innerHeight;
	camera = new THREE.PerspectiveCamera( 40, aspect, 1, 10000 );
	camera.position.z = Math.max( 3000, 3100 / ( 2 * Math.tan( THREE.MathUtils.degToRad( 20 ) ) * aspect ) );

	scene = new THREE.Scene();

	for ( let i = 0; i < count; i ++ ) {

		const objectCSS = new CSS3DObject( createTile( people[ i ] ) );
		objectCSS.position.x = Math.random() * 4000 - 2000;
		objectCSS.position.y = Math.random() * 4000 - 2000;
		objectCSS.position.z = Math.random() * 4000 - 2000;
		scene.add( objectCSS );

		objects.push( objectCSS );

	}

	const COLS = 20, ROWS = 10;

	for ( let i = 0; i < count; i ++ ) {

		const col = i % COLS;
		const row = Math.floor( i / COLS ) % ROWS;

		const object = new THREE.Object3D();
		object.position.x = ( col - ( COLS - 1 ) / 2 ) * 140;
		object.position.y = - ( row - ( ROWS - 1 ) / 2 ) * 180;

		targets.table.push( object );

	}

	const vector = new THREE.Vector3();

	for ( let i = 0; i < count; i ++ ) {

		const phi = Math.acos( - 1 + ( 2 * i ) / count );
		const theta = Math.sqrt( count * Math.PI ) * phi;

		const object = new THREE.Object3D();
		object.position.setFromSphericalCoords( 800, phi, theta );

		vector.copy( object.position ).multiplyScalar( 2 );
		object.lookAt( vector );

		targets.sphere.push( object );

	}

	const perStrand = Math.ceil( count / 2 );
	const stepY = 16;

	for ( let i = 0; i < count; i ++ ) {

		const strand = i % 2;
		const k = Math.floor( i / 2 );

		const theta = k * 0.35 + strand * Math.PI;
		const y = - ( k * stepY ) + ( perStrand - 1 ) * stepY / 2;

		const object = new THREE.Object3D();
		object.position.setFromCylindricalCoords( 900, theta, y );

		vector.x = object.position.x * 2;
		vector.y = object.position.y;
		vector.z = object.position.z * 2;
		object.lookAt( vector );

		targets.helix.push( object );

	}

	const GX = 5, GY = 4, GZ = 10;

	for ( let i = 0; i < count; i ++ ) {

		const x = i % GX;
		const y = Math.floor( i / GX ) % GY;
		const z = Math.floor( i / ( GX * GY ) ) % GZ;

		const object = new THREE.Object3D();
		object.position.x = ( x - ( GX - 1 ) / 2 ) * 400;
		object.position.y = - ( y - ( GY - 1 ) / 2 ) * 400;
		object.position.z = ( z - ( GZ - 1 ) / 2 ) * 400;

		targets.grid.push( object );

	}

	renderer = new CSS3DRenderer();
	renderer.setSize( window.innerWidth, window.innerHeight );
	$( 'container' ).appendChild( renderer.domElement );

	controls = new TrackballControls( camera, renderer.domElement );
	controls.minDistance = 500;
	controls.maxDistance = 6000;
	controls.addEventListener( 'change', render );

	for ( const key of [ 'table', 'sphere', 'helix', 'grid' ] ) {

		$( key ).addEventListener( 'click', () => layout( key ) );

	}

	layout( 'table' );

	window.addEventListener( 'resize', onWindowResize );

}

function layout( key ) {

	for ( const k of Object.keys( targets ) ) $( k ).classList.toggle( 'active', k === key );
	transform( targets[ key ], 2000 );

}

function transform( targets, duration ) {

	TWEEN.removeAll();

	for ( let i = 0; i < objects.length; i ++ ) {

		const object = objects[ i ];
		const target = targets[ i ];

		new TWEEN.Tween( object.position )
			.to( { x: target.position.x, y: target.position.y, z: target.position.z }, Math.random() * duration + duration )
			.easing( TWEEN.Easing.Exponential.InOut )
			.start();

		new TWEEN.Tween( object.rotation )
			.to( { x: target.rotation.x, y: target.rotation.y, z: target.rotation.z }, Math.random() * duration + duration )
			.easing( TWEEN.Easing.Exponential.InOut )
			.start();

	}

	new TWEEN.Tween( {} )
		.to( {}, duration * 2 )
		.onUpdate( render )
		.start();

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

	render();

}

function animate() {

	requestAnimationFrame( animate );

	TWEEN.update();

	controls.update();

}

function render() {

	renderer.render( scene, camera );

}

initLogin();