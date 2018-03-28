const Sequelize = require('sequelize');

const {log, biglog, errorlog, colorize} = require("./out");

const {models} = require('./model');

/**
* Muestra la ayuda
*/
exports.helpCmd = (socket, rl) => {
	log(socket, "Comandos:");
	log(socket, "	h|help - Muestra esta ayuda.");
	log(socket, "	list - Listar los quizzes existentes");
	log(socket, "	show <id> - Muestra la pregunta y la respuesta del quiz indicado");
	log(socket, "	add - Añadir un nuevo quiz interactivamente");
	log(socket, "	delete <id> - Borrar el quiz indicado");
	log(socket, "	edit <id> - Editar el quiz indicado");
	log(socket, "	test <id> - Probar el quiz indicado");
	log(socket, "	p|play - Jugar a preguntar aleatoriamente todos los quizzes");
	log(socket, "	credits - Créditos");
	log(socket, "	q|quit - Salir del programa.");
	rl.prompt();

};



/**
*	 Terminar el programa
*/
exports.quitCmd = (socket, rl) => {
	rl.close();
	socket.end();
};




/**
*
*	Esta función devuelve una promesa cuando se cumple, proporciona el texto introducido
*	Entonces la llamada a then que hay que hacer la promesa devuelta será:
*		.then(answer => {...})
*
*	@param rl Objeto readLine
*	@param text Pregunta que hay que hacerle al usuario
*/
const makeQuestion = (rl, text) => {

	return new Sequelize.Promise((resolve, reject) =>{
		rl.question(colorize(text, 'red'), answer => {
			resolve(answer.trim());
		});
	});
};

/**
*  Añade un nuevo quiz al modelo
*  Pregunta interativamente por la pregunta y por la respuesta
*  @param rl Objeto readline 
*/
exports.addCmd = (socket, rl) => {

	makeQuestion(rl, ' Introduzca una pregunta: ')
	.then(q => {
		return makeQuestion(rl, ' Introduzca una respuesta: ')
		.then(a => {
			return {question: q, answer: a};
		});
	})
	.then(quiz => {
		return models.quiz.create(quiz);
	})
	.then((quiz) => {
		log(socket, ` ${colorize('Se ha añadido', 'magenta')}: ${quiz.question} ${colorize('=>', 'magenta')} ${quiz.answer}`)
	})
	.catch(Sequelize.ValidationError, error => {
		errorlog(socket, 'El quiz es erroneo:');
		error.errors.forEach(({message}) => errorlog(socket, message));
	})
	.catch(error => {
		errorlog(socket, error.message);
	})
	.then(()=> {
		rl.prompt();
	});
};



/**
*	Lista todos los quizzes existentes en el modelo
*/
exports.listCmd = (socket, rl) => {
	
	models.quiz.findAll()
	.each(quiz => {
		log(socket, ` [${colorize(quiz.id, 'magenta')}]: ${quiz.question}`);
	})
	.catch(error => {
		errorlog(socket, error.message);
	})
	.then(() => {
		rl.prompt();
	});
};


/**
*	Esta función devuelve una promesa que:
*	- Valida que se ha introducido un valor en el parámetro
*	- Convierte el parámetro en un nº entero
*	Si todo va bien, la promesa se satisface y devuelve el valor id a usar
*
*	@param id Parametro con el índice a validar
*/

const validateId = (socket, id) => {

	return new Sequelize.Promise((resolve, reject) => {
		if(typeof id === "undefined"){
			reject(new Error(`Falta el parámetro <id>.`));
		} else{
			id = parseInt(id);	// coger la parte entera y descartar lo demás
			if (Number.isNaN(id)){
				reject(new Error(`El valor del parámetro <id> no es un número.`));
			} else{
				resolve(id);
			}
		}
	});
};




/**
*	Muestra el quiz indicado en el parámetro: la pregunta y la respuesta
*
*	@param rl Objeto readLine
*	@param id Clave del quiz a mostrar
*/
exports.showCmd = (socket, rl, id) => {
	
	validateId(id)
	.then(id => models.quiz.findById(id))
	.then(quiz => {
		if (!quiz){
			throw new Error(socket, `No existe un quiz asociado al id=${id}.`);
		}
		log(socket, ` [${colorize(quiz.id, 'magenta')}]: ${quiz.question} ${colorize('=>', 'magenta')} ${quiz.answer}`);
	})
	.catch(error => {
		errorlog(socket, error.message);
	})
	.then(() => {
		rl.prompt();
	});
};


/**
*	Prueba un quiz, es decir, hace una pregunta del modelo a la que debemos contestar
*
*	@rl Objeto readLine
*	@param id Clave del quiz a probar
*/

exports.testCmd = (socket, rl, id) => {
	validateId(id)
	.then(id => models.quiz.findById(id))
	.then(quiz => {
		if(!quiz){
			throw new Error(socket, `No existe un quiz asociado al id=${id}.`);
		}
		return makeQuestion(rl, `{quiz.question}`)
		.then(answer => {
			if (answer.toLowerCase() === quiz.answer.toLowerCase().trim()){
				log(socket, ` ${colorize('Correcto', 'magenta')}`);
				biglog(socket, 'Correcto', 'green');
			} else{
				log(socket, ` ${colorize('Incorrecto', 'magenta')}`);
				biglog(socket, 'Incorrecto', 'red');
			}
		});
	})
	.catch(error => {
		errorlog(socket, error.message);
	});
};


/*

/**
*	Pregunta todos los quizzes existentes en el modelo en orden aleatorio
*	Se gana si se contestan todos satisfactoriamente 
*
*/
exports.playCmd = (socket, rl) => {

	let score = 0;
	let toBeResolved = [];

	const playOne = () => {
		return new Promise((resolve, reject) => {
			if(toBeResolved.length <= 0){
				log(socket, 'No quedan más preguntas');
				resolve();
				return;
			}

			let id = Math.floor((Math.random() * toBeResolved.length));
			let quiz = toBeResolved[id];
			toBeResolved.splice(id, 1);

			return makeQuestion(rl, `${quiz.question}`)
			.then(answer => {
				if(answer.toLowerCase() === quiz.answer.toLowerCase().trim()){
					score++;
					log(socket, `CORRECTO - Lleva ${score} acierto/s.`);
					resolve(playOne());
				}else {
					log(socket, `INCORRECTO`);
					resolve();
				}
			});
		});
	};

	models.quiz.findAll({raw: true})
	.then(quizzes => {
		toBeResolved = quizzes;
	})
	.then(() => {
		return playOne();
	})
	.catch(error => {
		errorlog(socket, error.message);
	})
	.then(() => {
		fin();
		rl.prompt();
	});

	const fin = () => {
		log(socket, `Fin de examen. Aciertos:`);
		biglog(socket, `${score}`);
	};

};





/**
*	Borra un quiz del modelo
*
*	@param id Clave del quiz a borrar en el modelo
*	@param rl Objeto readLine
*/
exports.deleteCmd = (socket, rl, id) => {

	validateId(id)
	.then(id => models.quiz.destroy({where: {id}}))
	.catch(error => {
		errorlog(socket, error.message);
	})
	.then(()=> {
		rl.prompt();
	});
};


/**
*	Edita un quiz del modelo
*
*	@param id Clave del quiz a editar en el modelo
*	@param rl Objeto readline
*/
exports.editCmd = (socket, rl, id) => {

	validateId(id)
	.then(id => models.quiz.findById(id))
	.then(quiz => {
		if (!quiz){
			throw new Error(socket, `No existe un quiz asociado al id={id}.`);
		}

		process.stdout.isTTY && setTimeout(() => {rl.write(quiz.question)}, 0);
		return makeQuestion(rl, ' Introduzca la pregunta: ')
		.then(q => {
			process.stdout.isTTY && setTimeout(() => {rl.write(quiz.answer)}, 0);
			return makeQuestion(rl, ' Introduzca la respuesta: ')
			.then(a => {
				quiz.question = q;
				quiz.answer = a;
				return quiz;
			});
		});
	})

	.then(quiz => {
		return quiz.save();
	})
	.then(quiz => {
		log(socket, ` Se ha cambiado el quiz ${colorize(quiz.id, 'magenta')} por: ${quiz.question} ${colorize('=>', 'magenta')} ${quiz.answer}`)
	})
	.catch(Sequelize.ValidationError, error => {
		errorlog(socket, 'El quiz es erroneo:');
		error.errors.forEach(({message}) => errorlog(socket, message));
	})
	.catch(error => {
		errorlog(socket, error.message);
	})
	.then(()=> {
		rl.prompt();
	});
};


/**
* Muestra los nombres de los autores de la práctica
*/
exports.creditsCmd = (socket, rl) => {
	log(socket, 'Autor de la práctica:');
	log(socket, 'Daniel Payno Zarceño', 'green');
	rl.prompt();

};


