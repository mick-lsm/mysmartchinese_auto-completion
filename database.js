import { DataTypes, Sequelize } from 'sequelize';

// Database configuration
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite',
    logging: false
});

const Accounts = sequelize.define("Accounts", {
    username: {
        type: DataTypes.STRING,
        allowNull: false
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    correct_chance: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.7
    },
    student_class:{
        type: DataTypes.STRING,
        allowNull: false
    },
    student_number:{
        type: DataTypes.INTEGER,
        allowNull: false
    },
    enable_normal_exercises:{
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    enable_edb_exercises: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
});

const CachedQuestions = sequelize.define('CachedQuestions', {
    question_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    answer_id: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

await sequelize.sync();

export { Accounts, CachedQuestions }
